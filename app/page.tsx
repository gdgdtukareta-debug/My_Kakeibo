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
  const [balance, setBalance] = useState(0);
  const [savings, setSavings] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [expense, setExpense] = useState("");
  const [memo, setMemo] = useState(""); // メモ用の状態を追加
  const [category, setCategory] = useState("食費");
  const [loading, setLoading] = useState(true);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const categories = ["食費", "日用品", "趣味", "仕事", "その他", "特別支出"];

  const loadData = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const docSnap = await getDoc(docRef);
      
      let currentBudget = 1000;
      let currentPayday = 25;
      let currentMonthlySaving = 0;
      let currentSavings = 0;
      let rawHistory: any[] = [];
      let lastAccessedMonth = "";

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.settings) {
          currentBudget = data.settings.dailyBudget || 1000;
          currentPayday = data.settings.payday || 25;
          currentMonthlySaving = data.settings.monthlySavingTarget || 0;
          lastAccessedMonth = data.settings.lastAccessedMonth || "";
          setDailyBudget(currentBudget);
          setPayday(currentPayday);
          setMonthlySavingTarget(currentMonthlySaving);
        }
        currentSavings = data.savings_balance || 0;
        rawHistory = data.history || [];
      }

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;

      if (lastAccessedMonth !== "" && lastAccessedMonth !== currentMonthKey) {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
        const diffDays = Math.ceil(Math.abs(now.getTime() - prevMonthDate.getTime()) / (1000 * 60 * 60 * 24));
        const prevRegularSpent = rawHistory
          .filter(item => item.category !== "特別支出")
          .reduce((sum, item) => sum + item.amount, 0);
        
        const surplus = (diffDays * currentBudget) - prevRegularSpent;
        const totalToSave = (surplus > 0 ? surplus : 0) + currentMonthlySaving;

        if (totalToSave > 0) {
          currentSavings += totalToSave;
          await updateDoc(docRef, {
            savings_balance: currentSavings,
            history: [], 
            "settings.lastAccessedMonth": currentMonthKey
          });
          rawHistory = [];
        } else {
          await updateDoc(docRef, { "settings.lastAccessedMonth": currentMonthKey });
        }
      } else if (lastAccessedMonth === "") {
        await updateDoc(docRef, { "settings.lastAccessedMonth": currentMonthKey });
      }

      setSavings(currentSavings);
      const sortedHistory = [...rawHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sortedHistory);

      const catTotals: { [key: string]: number } = {};
      categories.forEach(c => catTotals[c] = 0);
      let totalAll = 0;
      let totalRegular = 0;

      rawHistory.forEach(item => {
        totalAll += item.amount;
        catTotals[item.category] = (catTotals[item.category] || 0) + item.amount;
        if (item.category !== "特別支出") totalRegular += item.amount;
      });

      setTotalSpent(totalAll);
      let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
      if (now < startDate) startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
      const diffDays = Math.ceil(Math.abs(now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentBalance = (diffDays * currentBudget) - totalRegular;
      setBalance(currentBalance);

      const isOverBudget = currentBalance < 0;
      const normalColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      const warningColors = ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b', '#db2777'];

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
      if (category === "特別支出") newSavings -= amount;
      
      // 履歴オブジェクトにメモを追加
      const newHistory = [...history, { 
        amount, 
        category, 
        memo, // ここでメモを保存
        date: new Date().toISOString() 
      }];

      await updateDoc(docRef, { 
        history: newHistory,
        savings_balance: newSavings
      });
      
      setExpense("");
      setMemo(""); // 保存後にメモをクリア
      loadData();
    } catch (e) { alert("保存に失敗しました"); }
  };

  const deleteItem = async (index: number) => {
    if (!confirm("この記録を消去しますか？")) return;
    try {
      const item = history[index];
      let newSavings = savings;
      if (item.category === "特別支出") newSavings += item.amount;
      const newHistory = history.filter((_, i) => i !== index);
      await updateDoc(doc(db, "kakeibo", "user_data"), { 
        history: newHistory,
        savings_balance: newSavings
      });
      loadData();
    } catch (e) { alert("削除失敗"); }
  };

  const editItem = async (index: number) => {
    const item = history[index];
    const newAmount = prompt("新しい金額を入力してください", item.amount.toString());
    if (newAmount === null || isNaN(Number(newAmount))) return;
    
    const catList = categories.join(", ");
    const newCat = prompt(`新しいカテゴリーを入力してください\n(${catList})`, item.category);
    if (newCat === null || !categories.includes(newCat)) return;

    const newMemo = prompt("メモを修正してください", item.memo || "");
    if (newMemo === null) return;

    try {
      const newHistory = [...history];
      let newSavings = savings;
      if (item.category === "特別支出") newSavings += item.amount;
      if (newCat === "特別支出") newSavings -= Number(newAmount);
      
      newHistory[index] = { 
        ...item, 
        amount: Number(newAmount), 
        category: newCat,
        memo: newMemo 
      };

      await updateDoc(doc(db, "kakeibo", "user_data"), { 
        history: newHistory,
        savings_balance: newSavings
      });
      loadData();
    } catch (e) { alert("修正失敗"); }
  };

  const handleUpdateSettings = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const result = confirm(`設定を更新します。\nさらに、固定貯金額 ¥${monthlySavingTarget.toLocaleString()} を今すぐSavingsに反映（加算）させますか？`);
      const newSettings = { 
        dailyBudget, payday, monthlySavingTarget, 
        lastAccessedMonth: `${new Date().getFullYear()}-${new Date().getMonth()}` 
      };
      if (result) {
        await updateDoc(docRef, { settings: newSettings, savings_balance: savings + monthlySavingTarget });
      } else {
        await updateDoc(docRef, { settings: newSettings });
      }
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
                 <label className="text-[10px] text-gray-400 font-bold ml-1">PAYDAY</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={payday} onChange={(e)=>setPayday(Number(e.target.value))} />
               </div>
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">MONTHLY FIXED SAVINGS</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={monthlySavingTarget} onChange={(e)=>setMonthlySavingTarget(Number(e.target.value))} />
               </div>
               <button onClick={handleUpdateSettings} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-sm shadow-lg">UPDATE & APPLY</button>
             </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-300 mb-1 uppercase tracking-tighter">Current Balance</p>
                  <p className={`text-2xl font-mono font-bold ${balance < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                      ¥{balance.toLocaleString()}
                  </p>
              </div>
              <div className="flex-1 bg-gradient-to-br from-pink-50 to-white p-4 rounded-3xl shadow-sm border border-pink-100">
                  <p className="text-[10px] font-bold text-pink-300 mb-1 uppercase tracking-tighter">Savings (Events)</p>
                  <p className="text-2xl font-mono font-bold text-pink-500">
                      ¥{savings.toLocaleString()}
                  </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      category === cat 
                        ? (cat === '特別支出' ? 'bg-pink-500 text-white shadow-md' : 'bg-blue-600 text-white shadow-md') 
                        : 'bg-gray-50 text-gray-400'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="number" inputMode="numeric" placeholder="0" 
                    className="w-32 p-4 bg-gray-50 rounded-xl text-2xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-center"
                    value={expense} onChange={(e) => setExpense(e.target.value)} />
                  <button onClick={handlePayment} className={`flex-1 text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all uppercase tracking-widest ${category === '特別支出' ? 'bg-pink-500 shadow-pink-100' : 'bg-blue-600 shadow-blue-100'}`}>
                    {category === '特別支出' ? 'Event' : 'Save'}
                  </button>
                </div>
                {/* メモ入力欄の追加 */}
                <input type="text" placeholder="何に使った？（例：おやつ代）"
                  className="w-full p-3 bg-gray-50 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all"
                  value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <p className="text-[10px] font-bold text-gray-400 mb-3 uppercase tracking-widest">Recent History</p>
              <div className="space-y-4">
                {history.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-start justify-between border-b border-gray-50 pb-2">
                    <div className="flex-1">
                      <div className="flex items-center mb-1">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded mr-2 uppercase ${item.category === '特別支出' ? 'bg-pink-100 text-pink-500' : 'bg-gray-100 text-gray-500'}`}>{item.category}</span>
                        <span className="text-sm font-mono font-bold">¥{item.amount.toLocaleString()}</span>
                      </div>
                      {/* 履歴にメモを表示 */}
                      {item.memo && <p className="text-[10px] text-gray-400 leading-tight ml-1">{item.memo}</p>}
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => editItem(index)} className="text-blue-400 text-[10px] font-bold uppercase">Edit</button>
                      <button onClick={() => deleteItem(index)} className="text-red-400 text-[10px] font-bold uppercase">Del</button>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <p className="text-xs text-gray-300 text-center italic">No history yet</p>}
              </div>
            </div>

            {chartData && totalSpent > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest text-center">Category Distribution</p>
                <div className="px-8">
                  <Pie data={chartData} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 }, color: '#9ca3af' } } } }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}