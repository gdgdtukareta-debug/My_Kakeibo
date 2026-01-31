"use client";
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase'; 
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Home() {
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [payday, setPayday] = useState(25);
  const [monthlySavingTarget, setMonthlySavingTarget] = useState(0); 
  const [monthlyInvestmentTarget, setMonthlyInvestmentTarget] = useState(0); // 投資積立枠
  const [balance, setBalance] = useState(0);
  const [savings, setSavings] = useState(0);
  const [investmentBalance, setInvestmentBalance] = useState(0); // 投資財布の残高
  const [totalSpent, setTotalSpent] = useState(0);
  const [expense, setExpense] = useState("");
  const [memo, setMemo] = useState("");
  const [category, setCategory] = useState("食費");
  const [loading, setLoading] = useState(true);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  // カテゴリ一覧（投資・貯金用と臨時収入を追加）
  const categories = ["食費", "日用品", "趣味", "仕事", "その他", "特別支出", "投資・貯金", "臨時収入"];

  const loadData = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const docSnap = await getDoc(docRef);
      
      let currentBudget = 1000;
      let currentPayday = 25;
      let currentMonthlySaving = 0;
      let currentMonthlyInvestment = 0;
      let currentSavings = 0;
      let currentInvestmentBalance = 0;
      let rawHistory: any[] = [];
      let lastAccessedMonth = "";

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.settings) {
          currentBudget = data.settings.dailyBudget || 1000;
          currentPayday = data.settings.payday || 25;
          currentMonthlySaving = data.settings.monthlySavingTarget || 0;
          currentMonthlyInvestment = data.settings.monthlyInvestmentTarget || 0;
          lastAccessedMonth = data.settings.lastAccessedMonth || "";
          setDailyBudget(currentBudget);
          setPayday(currentPayday);
          setMonthlySavingTarget(currentMonthlySaving);
          setMonthlyInvestmentTarget(currentMonthlyInvestment);
        }
        currentSavings = data.savings_balance || 0;
        currentInvestmentBalance = data.investment_balance || 0;
        rawHistory = data.history || [];
      }

      // --- 月替わりロジック ---
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;

      if (lastAccessedMonth !== "" && lastAccessedMonth !== currentMonthKey) {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
        const diffDays = Math.ceil(Math.abs(now.getTime() - prevMonthDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // 通常支出のみ集計（特別支出、投資・貯金、臨時収入は除外）
        const prevRegularSpent = rawHistory
          .filter(item => !["特別支出", "投資・貯金", "臨時収入"].includes(item.category))
          .reduce((sum, item) => sum + item.amount, 0);
        
        const surplus = (diffDays * currentBudget) - prevRegularSpent;
        
        // 1. 特別支出財布への加算
        const totalToSave = (surplus > 0 ? surplus : 0) + currentMonthlySaving;
        currentSavings += totalToSave;

        // 2. 投資・貯金財布への加算（前月残高維持 + 自動積立枠）
        currentInvestmentBalance += currentMonthlyInvestment;

        await updateDoc(docRef, {
          savings_balance: currentSavings,
          investment_balance: currentInvestmentBalance,
          history: [], 
          "settings.lastAccessedMonth": currentMonthKey
        });
        rawHistory = [];
      } else if (lastAccessedMonth === "") {
        await updateDoc(docRef, { "settings.lastAccessedMonth": currentMonthKey });
      }

      setSavings(currentSavings);
      setInvestmentBalance(currentInvestmentBalance);
      
      const sortedHistory = [...rawHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sortedHistory);

      // --- 残高・グラフ計算 ---
      const catTotals: { [key: string]: number } = {};
      categories.forEach(c => catTotals[c] = 0);
      let totalAll = 0;
      let totalRegular = 0;

      rawHistory.forEach(item => {
        totalAll += item.amount;
        catTotals[item.category] = (catTotals[item.category] || 0) + item.amount;
        // 生活費に影響させないカテゴリを除外
        if (!["特別支出", "投資・貯金", "臨時収入"].includes(item.category)) {
          totalRegular += item.amount;
        }
      });

      setTotalSpent(totalAll);
      let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
      if (now < startDate) startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
      const diffDays = Math.ceil(Math.abs(now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const currentBalance = (diffDays * currentBudget) - totalRegular;
      setBalance(currentBalance);

      const isOverBudget = currentBalance < 0;
      const normalColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];
      const warningColors = ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b', '#db2777', '#4338ca', '#0d9488'];

      setChartData({
        labels: categories,
        datasets: [{
          data: categories.map(c => catTotals[c]),
          backgroundColor: isOverBudget ? warningColors : normalColors,
          borderWidth: 1,
        }]
      });

    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handlePayment = async () => {
    const amount = Number(expense);
    if (!amount || amount <= 0) return;
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      let newSavings = savings;
      let newInvestmentBalance = investmentBalance;

      // 財布ごとの振分ロジック
      if (category === "特別支出") {
        newSavings -= amount;
      } else if (category === "投資・貯金") {
        newInvestmentBalance -= amount; // 支出として引く
      } else if (category === "臨時収入") {
        newInvestmentBalance += amount; // 貯金へ追加
      }
      
      const newHistory = [...history, { 
        amount, category, memo, date: new Date().toISOString() 
      }];

      await updateDoc(docRef, { 
        history: newHistory,
        savings_balance: newSavings,
        investment_balance: newInvestmentBalance
      });
      
      setExpense("");
      setMemo("");
      loadData();
    } catch (e) { alert("保存に失敗しました"); }
  };

  const deleteItem = async (index: number) => {
    if (!confirm("この記録を消去しますか？")) return;
    try {
      const item = history[index];
      let newSavings = savings;
      let newInv = investmentBalance;
      if (item.category === "特別支出") newSavings += item.amount;
      if (item.category === "投資・貯金") newInv += item.amount;
      if (item.category === "臨時収入") newInv -= item.amount;

      const newHistory = history.filter((_, i) => i !== index);
      await updateDoc(doc(db, "kakeibo", "user_data"), { 
        history: newHistory,
        savings_balance: newSavings,
        investment_balance: newInv
      });
      loadData();
    } catch (e) { alert("削除失敗"); }
  };

  const editItem = async (index: number) => {
    // 簡易化のため一旦Editはアラートで制限するか、前のロジックを維持
    alert("編集機能は将来のアップデートで詳細対応予定です。現在は削除して再入力してください。");
  };

  const handleUpdateSettings = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const result = confirm("設定を更新しますか？");
      if (!result) return;

      const newSettings = { 
        dailyBudget, payday, monthlySavingTarget, monthlyInvestmentTarget,
        lastAccessedMonth: `${new Date().getFullYear()}-${new Date().getMonth()}` 
      };
      
      await updateDoc(docRef, { settings: newSettings });
      setIsSettingMode(false);
      loadData();
    } catch (e) { alert("設定の更新に失敗しました"); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-mono">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-900">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold text-gray-700 font-mono italic">MY KAKEIBO</h1>
          <button onClick={() => setIsSettingMode(!isSettingMode)} className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-full text-gray-400 font-bold tracking-widest shadow-sm">
            {isSettingMode ? "CLOSE" : "SETTINGS"}
          </button>
        </div>

        {isSettingMode ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100">
             <h2 className="font-bold mb-4 text-sm text-blue-800 uppercase text-center">Budget Settings</h2>
             <div className="space-y-4">
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">DAILY BUDGET</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={dailyBudget} onChange={(e)=>setDailyBudget(Number(e.target.value))} />
               </div>
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">MONTHLY SAVINGS (SPECIAL)</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={monthlySavingTarget} onChange={(e)=>setMonthlySavingTarget(Number(e.target.value))} />
               </div>
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">MONTHLY INVESTMENT (積立枠)</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={monthlyInvestmentTarget} onChange={(e)=>setMonthlyInvestmentTarget(Number(e.target.value))} />
               </div>
               <button onClick={handleUpdateSettings} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-sm shadow-lg">UPDATE SETTINGS</button>
             </div>
          </div>
        ) : (
          <>
            {/* 財布パネルエリア */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-[8px] font-bold text-gray-300 mb-1 uppercase">Daily Balance</p>
                  <p className={`text-lg font-mono font-bold ${balance < 0 ? 'text-red-500' : 'text-blue-600'}`}>¥{balance.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-pink-50 to-white p-3 rounded-2xl shadow-sm border border-pink-100">
                  <p className="text-[8px] font-bold text-pink-300 mb-1 uppercase">Special Savings</p>
                  <p className="text-lg font-mono font-bold text-pink-500">¥{savings.toLocaleString()}</p>
              </div>
            </div>
            
            {/* 3つ目の財布（投資・貯金） */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-md mb-4 text-white">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Investment & Savings</p>
                  <span className="text-[8px] bg-white/20 px-2 py-0.5 rounded">Carry-over Mode</span>
                </div>
                <p className={`text-2xl font-mono font-bold mt-1 ${investmentBalance < 0 ? 'text-red-200' : 'text-white'}`}>
                    ¥{investmentBalance.toLocaleString()}
                </p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex flex-wrap gap-1.5 mb-4">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all ${
                      category === cat 
                        ? (cat === '投資・貯金' || cat === '臨時収入' ? 'bg-indigo-600 text-white' : cat === '特別支出' ? 'bg-pink-500 text-white' : 'bg-blue-600 text-white') 
                        : 'bg-gray-50 text-gray-400'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="number" inputMode="numeric" placeholder="0" 
                    className="w-32 p-4 bg-gray-50 rounded-xl text-2xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all text-center"
                    value={expense} onChange={(e) => setExpense(e.target.value)} />
                  <button onClick={handlePayment} className={`flex-1 text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all uppercase tracking-widest ${category === '投資・貯金' || category === '臨時収入' ? 'bg-indigo-600' : category === '特別支出' ? 'bg-pink-500' : 'bg-blue-600'}`}>
                    {category === '臨時収入' ? 'Add' : 'Entry'}
                  </button>
                </div>
                <input type="text" placeholder="メモ（銘柄、収入源など）"
                  className="w-full p-3 bg-gray-50 rounded-xl text-xs outline-none focus:bg-white"
                  value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <p className="text-[10px] font-bold text-gray-400 mb-3 uppercase tracking-widest">Recent History</p>
              <div className="space-y-3">
                {history.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded mr-2 uppercase ${item.category === '投資・貯金' || item.category === '臨時収入' ? 'bg-indigo-100 text-indigo-600' : item.category === '特別支出' ? 'bg-pink-100 text-pink-500' : 'bg-gray-100 text-gray-500'}`}>{item.category}</span>
                        <span className={`text-sm font-mono font-bold ${item.category === '臨時収入' ? 'text-green-600' : ''}`}>
                          {item.category === '臨時収入' ? '+' : ''}¥{item.amount.toLocaleString()}
                        </span>
                      </div>
                      {item.memo && <p className="text-[9px] text-gray-400 ml-1 mt-0.5">{item.memo}</p>}
                    </div>
                    <button onClick={() => deleteItem(index)} className="text-red-300 text-[9px] font-bold uppercase hover:text-red-500">Del</button>
                  </div>
                ))}
              </div>
            </div>

            {chartData && totalSpent > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest text-center">Distribution</p>
                <div className="px-10">
                  <Pie data={chartData} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 8 } } } } }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}