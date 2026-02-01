"use client";
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase'; 
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

// 型定義
type Transaction = {
  amount: number;
  category: string;
  memo: string;
  date: string; // ISOString
};

type Subscription = {
  id: number;
  name: string;
  amount: number;
  payDay: number | ""; // 空白なら月初の起動時に支払い
  category: string;
  lastPaidMonth: string; // "YYYY-M" 形式で支払い済み月を記録
};

type Archives = {
  [key: string]: Transaction[]; // "YYYY-M": [履歴]
};

export default function Home() {
  // --- 基本設定 State ---
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [payday, setPayday] = useState(25);
  const [monthlySavingTarget, setMonthlySavingTarget] = useState(0); 
  const [monthlyInvestmentTarget, setMonthlyInvestmentTarget] = useState(0); 
  
  // --- 資産・収支 State ---
  const [balance, setBalance] = useState(0);
  const [savings, setSavings] = useState(0);
  const [investmentBalance, setInvestmentBalance] = useState(0); 
  const [totalSpent, setTotalSpent] = useState(0);
  
  // --- 入力フォーム State ---
  const [expense, setExpense] = useState("");
  const [memo, setMemo] = useState(""); 
  const [category, setCategory] = useState("食費");
  const [inputDate, setInputDate] = useState(""); // 日付入力用 (YYYY-MM-DD)

  // --- アプリ制御 State ---
  const [loading, setLoading] = useState(true);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  
  // --- 新機能用 State ---
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [archives, setArchives] = useState<Archives>({});
  const [isCsvMode, setIsCsvMode] = useState(false); // CSV機能のON/OFF

  // カテゴリ定義
  const categories = ["食費", "日用品", "趣味", "仕事", "その他", "特別支出", "投資・貯金", "臨時収入"];

  // 今日の日付をセット (YYYY-MM-DD形式)
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setInputDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // --- メインデータ読み込み & 自動処理ロジック ---
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
      let rawHistory: Transaction[] = [];
      let currentArchives: Archives = {};
      let currentSubs: Subscription[] = [];
      let lastAccessedMonth = "";
      let currentCsvMode = false;

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.settings) {
          currentBudget = data.settings.dailyBudget || 1000;
          currentPayday = data.settings.payday || 25;
          currentMonthlySaving = data.settings.monthlySavingTarget || 0;
          currentMonthlyInvestment = data.settings.monthlyInvestmentTarget || 0;
          lastAccessedMonth = data.settings.lastAccessedMonth || "";
          currentCsvMode = data.settings.isCsvMode || false;
          
          setDailyBudget(currentBudget);
          setPayday(currentPayday);
          setMonthlySavingTarget(currentMonthlySaving);
          setMonthlyInvestmentTarget(currentMonthlyInvestment);
          setIsCsvMode(currentCsvMode);
        }
        currentSavings = data.savings_balance || 0;
        currentInvestmentBalance = data.investment_balance || 0;
        rawHistory = data.history || [];
        currentArchives = data.archives || {};
        currentSubs = data.subscriptions || [];
      } else {
        await setDoc(docRef, { savings_balance: 0, investment_balance: 0, history: [], settings: {}, archives: {}, subscriptions: [] });
      }

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`; // 月識別用 (0-11)

      // --- 1. 月替わり判定 & アーカイブ処理 ---
      let isMonthChanged = false;
      if (lastAccessedMonth !== "" && lastAccessedMonth !== currentMonthKey) {
        // --- 残高計算ロジック（前月分） ---
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
        const diffDays = Math.ceil(Math.abs(now.getTime() - lastMonthDate.getTime()) / (1000 * 60 * 60 * 24));
        const prevRegularSpent = rawHistory
          .filter(item => !["特別支出", "投資・貯金", "臨時収入"].includes(item.category))
          .reduce((sum, item) => sum + item.amount, 0);
        
        const surplus = (diffDays * currentBudget) - prevRegularSpent;
        currentSavings += (surplus > 0 ? surplus : 0) + currentMonthlySaving;
        currentInvestmentBalance += currentMonthlyInvestment;

        // --- アーカイブへの移動 ---
        currentArchives[lastAccessedMonth] = rawHistory;
        
        // アーカイブは最新6ヶ月分のみ保持する（データ肥大化防止）
        const sortedKeys = Object.keys(currentArchives).sort();
        if (sortedKeys.length > 6) {
          const newArchives: Archives = {};
          sortedKeys.slice(-6).forEach(key => newArchives[key] = currentArchives[key]);
          currentArchives = newArchives;
        }

        rawHistory = []; // 履歴リセット
        isMonthChanged = true;
      }

      // --- 2. サブスク自動支払いチェック ---
      let subPaymentMade = false;
      const todayDate = now.getDate();
      
      const updatedSubs = currentSubs.map(sub => {
        // まだ今月支払っていない かつ (日付指定なしかつ月替わり後 OR 今日が支払日以降)
        const isDue = sub.lastPaidMonth !== currentMonthKey;
        const isTime = sub.payDay === "" || todayDate >= (sub.payDay as number);

        if (isDue && isTime) {
          // 支払い実行
          subPaymentMade = true;
          const subExpense = sub.amount;
          
          // 残高・履歴更新
          if (sub.category === "特別支出") currentSavings -= subExpense;
          else if (sub.category === "投資・貯金") currentInvestmentBalance -= subExpense;
          else if (sub.category === "臨時収入") currentInvestmentBalance += subExpense;
          // 通常支出はここではbalance stateには反映せず、history追加後の再計算に任せる

          rawHistory.push({
            amount: subExpense,
            category: sub.category,
            memo: `[Sub] ${sub.name}`,
            date: now.toISOString()
          });

          return { ...sub, lastPaidMonth: currentMonthKey };
        }
        return sub;
      });

      // --- 3. Firestore保存 (変更があった場合のみ) ---
      if (isMonthChanged || subPaymentMade || lastAccessedMonth === "") {
        await updateDoc(docRef, {
          savings_balance: currentSavings,
          investment_balance: currentInvestmentBalance,
          history: rawHistory,
          archives: currentArchives,
          subscriptions: updatedSubs,
          "settings.lastAccessedMonth": currentMonthKey
        });
      }

      // --- State更新 ---
      setSavings(currentSavings);
      setInvestmentBalance(currentInvestmentBalance);
      setSubscriptions(updatedSubs);
      setArchives(currentArchives);
      
      const sortedHistory = [...rawHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sortedHistory);

      // --- 統計・残高計算 ---
      const catTotals: { [key: string]: number } = {};
      categories.forEach(c => catTotals[c] = 0);
      let totalAll = 0;
      let totalRegular = 0;

      rawHistory.forEach(item => {
        totalAll += item.amount;
        catTotals[item.category] = (catTotals[item.category] || 0) + item.amount;
        if (!["特別支出", "投資・貯金", "臨時収入"].includes(item.category)) {
          totalRegular += item.amount;
        }
      });

      setTotalSpent(totalAll);
      
      // 給料日基準の残高計算
      let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
      // もし現在日付が給料日前なら、開始日は先月の給料日
      if (now < startDate) startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
      
      const timeFromStart = Math.abs(now.getTime() - startDate.getTime());
      const daysFromStart = Math.floor(timeFromStart / (1000 * 60 * 60 * 24)) + 1;
      
      const currentBalance = (daysFromStart * currentBudget) - totalRegular;
      setBalance(currentBalance);

      const isOverBudget = currentBalance < 0;
      setChartData({
        labels: categories,
        datasets: [{
          data: categories.map(c => catTotals[c]),
          backgroundColor: isOverBudget 
            ? ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b', '#db2777', '#4338ca', '#0d9488']
            : ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'],
          borderWidth: 1,
        }]
      });

    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  // --- 支払い処理 ---
  const handlePayment = async () => {
    const amount = Number(expense);
    if (!amount || amount <= 0) return;
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      let newSavings = savings;
      let newInv = investmentBalance;

      if (category === "特別支出") newSavings -= amount;
      else if (category === "投資・貯金") newInv -= amount;
      else if (category === "臨時収入") newInv += amount;
      
      // inputDateを使って日付オブジェクトを作成（時刻は現在時刻を付与）
      const recordDate = new Date(inputDate);
      const now = new Date();
      recordDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      const newHistory = [...history, { 
        amount, category, memo, date: recordDate.toISOString() 
      }];

      await updateDoc(docRef, { 
        history: newHistory,
        savings_balance: newSavings,
        investment_balance: newInv
      });
      
      setExpense("");
      setMemo("");
      loadData();
    } catch (e) { alert("保存に失敗しました"); }
  };

  // --- 削除処理 ---
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

  // --- 編集処理 ---
  const editItem = async (index: number) => {
    const item = history[index];
    const newAmountStr = prompt("新しい金額を入力してください", item.amount.toString());
    if (newAmountStr === null || isNaN(Number(newAmountStr))) return;
    const newAmount = Number(newAmountStr);

    const newCat = prompt(`新しいカテゴリーを入力してください\n(${categories.join(", ")})`, item.category);
    if (newCat === null || !categories.includes(newCat)) return;

    const newMemo = prompt("メモを修正してください", item.memo || "");
    if (newMemo === null) return;

    try {
      const newHistory = [...history];
      let newSavings = savings;
      let newInv = investmentBalance;

      // 古いデータの還元
      if (item.category === "特別支出") newSavings += item.amount;
      if (item.category === "投資・貯金") newInv += item.amount;
      if (item.category === "臨時収入") newInv -= item.amount;

      // 新しいデータの適用
      if (newCat === "特別支出") newSavings -= newAmount;
      if (newCat === "投資・貯金") newInv -= newAmount;
      if (newCat === "臨時収入") newInv += newAmount;

      newHistory[index] = { ...item, amount: newAmount, category: newCat, memo: newMemo };

      await updateDoc(doc(db, "kakeibo", "user_data"), { 
        history: newHistory,
        savings_balance: newSavings,
        investment_balance: newInv
      });
      loadData();
    } catch (e) { alert("修正失敗"); }
  };

  // --- 設定更新 ---
  const handleUpdateSettings = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const confirmAdd = confirm(`設定を更新します。\nさらに、固定貯金額 ¥${monthlySavingTarget.toLocaleString()} を今すぐ反映（加算）させますか？`);
      
      const newSettings = { 
        dailyBudget, payday, monthlySavingTarget, monthlyInvestmentTarget, isCsvMode,
        lastAccessedMonth: `${new Date().getFullYear()}-${new Date().getMonth()}` 
      };
      
      const updatePayload: any = { settings: newSettings, subscriptions: subscriptions };
      if (confirmAdd) {
        updatePayload.savings_balance = savings + monthlySavingTarget;
        updatePayload.investment_balance = investmentBalance + monthlyInvestmentTarget;
      }

      await updateDoc(docRef, updatePayload);
      setIsSettingMode(false);
      loadData();
    } catch (e) { alert("設定の更新に失敗しました"); }
  };

  // --- サブスク追加・削除ロジック ---
  const addSubscription = () => {
    const name = prompt("サブスク名を入力 (例: Netflix)");
    if (!name) return;
    const amountStr = prompt("金額を入力");
    if (!amountStr || isNaN(Number(amountStr))) return;
    const dayStr = prompt("毎月の支払日 (1-31)。空欄なら月変わり時に自動計上します。");
    const category = prompt(`カテゴリーを選択\n(${categories.join(", ")})`, "その他");
    
    if (!categories.includes(category || "")) {
        alert("正しいカテゴリーを入力してください");
        return;
    }

    const newSub: Subscription = {
        id: Date.now(),
        name,
        amount: Number(amountStr),
        payDay: dayStr ? Number(dayStr) : "",
        category: category || "その他",
        lastPaidMonth: "" // 初回は未払い扱い
    };
    setSubscriptions([...subscriptions, newSub]);
  };

  const deleteSubscription = (id: number) => {
    if(confirm("このサブスク設定を削除しますか？")) {
        setSubscriptions(subscriptions.filter(s => s.id !== id));
    }
  };

  // --- CSV出力ロジック ---
  const downloadCSV = () => {
    // 全履歴をマージ（アーカイブ + 今月の履歴）
    let allData: Transaction[] = [...history];
    Object.values(archives).forEach(monthHistory => {
        allData = [...allData, ...monthHistory];
    });

    // 日付順にソート
    allData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // CSVヘッダー
    let csvContent = "Date,Category,Amount,Memo\n";
    allData.forEach(item => {
        const d = new Date(item.date);
        const dateStr = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
        // メモにカンマが含まれる場合の対策でダブルクォートで囲む
        csvContent += `${dateStr},${item.category},${item.amount},"${item.memo || ''}"\n`;
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" }); // BOM付きUTF-8
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kakeibo_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };


  if (loading) return <div className="p-8 text-center text-gray-500 font-mono">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans text-gray-900">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold text-gray-700 font-mono italic">MY KAKEIBO</h1>
          <button onClick={() => setIsSettingMode(!isSettingMode)} className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-full text-gray-400 font-bold tracking-widest shadow-sm">
            {isSettingMode ? "CLOSE" : "SETTINGS"}
          </button>
        </div>

        {isSettingMode ? (
          // --- 設定画面 ---
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 max-h-[80vh] overflow-y-auto">
             <h2 className="font-bold mb-4 text-sm text-blue-800 uppercase text-center">Budget Settings</h2>
             
             {/* 基本予算設定 */}
             <div className="space-y-4 mb-8">
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">DAILY BUDGET</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={dailyBudget} onChange={(e)=>setDailyBudget(Number(e.target.value))} />
               </div>
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">PAYDAY</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={payday} onChange={(e)=>setPayday(Number(e.target.value))} />
               </div>
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">MONTHLY SAVINGS (SPECIAL)</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={monthlySavingTarget} onChange={(e)=>setMonthlySavingTarget(Number(e.target.value))} />
               </div>
               <div>
                 <label className="text-[10px] text-gray-400 font-bold ml-1">MONTHLY INVESTMENT (積立枠)</label>
                 <input type="number" className="w-full p-3 bg-gray-50 rounded-xl mt-1 font-mono" value={monthlyInvestmentTarget} onChange={(e)=>setMonthlyInvestmentTarget(Number(e.target.value))} />
               </div>
             </div>

             <hr className="border-gray-100 mb-6" />

             {/* サブスク設定 */}
             <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] text-gray-400 font-bold ml-1 uppercase">Subscriptions</label>
                    <button onClick={addSubscription} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-bold">＋ ADD</button>
                </div>
                <div className="space-y-2">
                    {subscriptions.map(sub => (
                        <div key={sub.id} className="bg-gray-50 p-3 rounded-xl flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-gray-700">{sub.name}</p>
                                <p className="text-[9px] text-gray-400">
                                    ¥{sub.amount.toLocaleString()} / {sub.payDay ? `Day ${sub.payDay}` : 'Monthly'} / {sub.category}
                                </p>
                            </div>
                            <button onClick={()=>deleteSubscription(sub.id)} className="text-red-300 text-[9px] font-bold">DEL</button>
                        </div>
                    ))}
                    {subscriptions.length === 0 && <p className="text-center text-[10px] text-gray-300">No subscriptions</p>}
                </div>
             </div>

             {/* CSV設定 */}
             <div className="mb-4">
                 <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                    <label className="text-[10px] text-gray-500 font-bold">CSV EXPORT MODE</label>
                    <input type="checkbox" checked={isCsvMode} onChange={(e) => setIsCsvMode(e.target.checked)} className="toggle" />
                 </div>
                 {isCsvMode && (
                     <button onClick={downloadCSV} className="w-full mt-2 bg-green-50 text-green-600 border border-green-200 p-2 rounded-xl text-xs font-bold">
                         DOWNLOAD PAST DATA (.csv)
                     </button>
                 )}
             </div>

             <button onClick={handleUpdateSettings} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-sm shadow-lg mt-4">UPDATE & APPLY</button>
          </div>
        ) : (
          // --- メイン画面 ---
          <>
            {/* 財布パネル */}
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
            
            {/* 投資・貯金パネル */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-md mb-4 text-white">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Investment & Savings</p>
                  <span className="text-[8px] bg-white/20 px-2 py-0.5 rounded">Carry-over</span>
                </div>
                <p className={`text-2xl font-mono font-bold mt-1 ${investmentBalance < 0 ? 'text-red-200' : 'text-white'}`}>
                    ¥{investmentBalance.toLocaleString()}
                </p>
            </div>

            {/* 入力エリア */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex flex-wrap gap-1.5 mb-4">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all ${
                      category === cat 
                        ? (cat === '投資・貯金' || cat === '臨時収入' ? 'bg-indigo-600 text-white shadow-md' : cat === '特別支出' ? 'bg-pink-500 text-white shadow-md' : 'bg-blue-600 text-white shadow-md') 
                        : 'bg-gray-50 text-gray-400'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="number" inputMode="numeric" placeholder="0" 
                    className="w-32 p-4 bg-gray-50 rounded-xl text-2xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-center"
                    value={expense} onChange={(e) => setExpense(e.target.value)} />
                  
                  <div className="flex-1 flex flex-col gap-2">
                     {/* 日付選択 */}
                     <input type="date" 
                        className="w-full p-2 bg-gray-50 rounded-lg text-xs font-mono text-gray-500 outline-none"
                        value={inputDate} onChange={(e) => setInputDate(e.target.value)}
                     />
                     <button onClick={handlePayment} className={`h-full text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all uppercase tracking-widest ${category === '投資・貯金' || category === '臨時収入' ? 'bg-indigo-600' : category === '特別支出' ? 'bg-pink-500' : 'bg-blue-600'}`}>
                        {category === '臨時収入' ? 'Add' : 'Entry'}
                     </button>
                  </div>
                </div>
                <input type="text" placeholder="メモ（品目、銘柄など）"
                  className="w-full p-3 bg-gray-50 rounded-xl text-xs outline-none focus:bg-white"
                  value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
            </div>

            {/* 履歴エリア */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <p className="text-[10px] font-bold text-gray-400 mb-3 uppercase tracking-widest">Recent History</p>
              <div className="space-y-3">
                {history.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-start justify-between border-b border-gray-50 pb-2">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded mr-2 uppercase ${item.category === '投資・貯金' || item.category === '臨時収入' ? 'bg-indigo-100 text-indigo-600' : item.category === '特別支出' ? 'bg-pink-100 text-pink-500' : 'bg-gray-100 text-gray-500'}`}>{item.category}</span>
                        <span className="text-[9px] text-gray-400 mr-2 font-mono">{new Date(item.date).toLocaleDateString()}</span>
                        <span className={`text-sm font-mono font-bold ${item.category === '臨時収入' ? 'text-green-600' : ''}`}>
                          {item.category === '臨時収入' ? '+' : ''}¥{item.amount.toLocaleString()}
                        </span>
                      </div>
                      {item.memo && <p className="text-[9px] text-gray-400 ml-1 mt-0.5">{item.memo}</p>}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => editItem(index)} className="text-blue-300 text-[9px] font-bold uppercase hover:text-blue-500">Edit</button>
                      <button onClick={() => deleteItem(index)} className="text-red-300 text-[9px] font-bold uppercase hover:text-red-500">Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* グラフエリア */}
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