"use client";
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase'; 
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Home() {
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [payday, setPayday] = useState(25);
  const [balance, setBalance] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [expense, setExpense] = useState("");
  const [category, setCategory] = useState("食費");
  const [loading, setLoading] = useState(true);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const categories = ["食費", "日用品", "趣味", "仕事", "その他"];

  const loadData = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const docSnap = await getDoc(docRef);
      
      let currentBudget = 1000;
      let currentPayday = 25;
      let rawHistory: any[] = [];

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.settings) {
          currentBudget = data.settings.dailyBudget || 1000;
          currentPayday = data.settings.payday || 25;
          setDailyBudget(currentBudget);
          setPayday(currentPayday);
        }
        rawHistory = data.history || [];
      }

      const sortedHistory = [...rawHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sortedHistory);

      const catTotals: { [key: string]: number } = {};
      categories.forEach(c => catTotals[c] = 0);
      let total = 0;
      rawHistory.forEach(item => {
        total += item.amount;
        catTotals[item.category] = (catTotals[item.category] || 0) + item.amount;
      });

      setTotalSpent(total);
      
      const now = new Date();
      let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
      if (now < startDate) startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
      const diffDays = Math.ceil(Math.abs(now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentBalance = (diffDays * currentBudget) - total;
      setBalance(currentBalance);

      const isOverBudget = currentBalance < 0;
      const normalColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      const warningColors = ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b'];

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
      const newHistory = [...history, { amount, category, date: new Date().toISOString() }];
      await updateDoc(docRef, { history: newHistory });
      setExpense("");
      loadData();
    } catch (e) { alert("保存に失敗しました"); }
  };

  const deleteItem = async (index: number) => {
    if (!confirm("この記録を消去しますか？")) return;
    try {
      const newHistory = history.filter((_, i) => i !== index);
      await updateDoc(doc(db, "kakeibo", "user_data"), { history: newHistory });
      loadData();
    } catch (e) { alert("削除失敗"); }
  };

  const editItem = async (index: number) => {
    const newAmount = prompt("新しい金額を入力してください", history[index].amount.toString());
    if (newAmount === null || isNaN(Number(newAmount))) return;
    try {
      const newHistory = [...history];
      newHistory[index].amount = Number(newAmount);
      await updateDoc(doc(db, "kakeibo", "user_data"), { history: newHistory });
      loadData();
    } catch (e) { alert("修正失敗"); }
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
               <button onClick={async () => {
                 await updateDoc(doc(db, "kakeibo", "user_data"), { settings: { dailyBudget, payday } });
                 setIsSettingMode(false);
                 loadData();
               }} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-sm shadow-lg">UPDATE</button>
             </div>
          </div>
        ) : (
          <>
            <div className="bg-white p-6 rounded-3xl mb-4 shadow-sm border border-gray-100">
                <p className="text-[10px] font-bold text-gray-300 mb-1 uppercase tracking-tighter">Current Balance</p>
                <p className={`text-4xl font-mono font-bold ${balance < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                    ¥{balance.toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400 mt-2 font-bold">TOTAL SPENT: ¥{totalSpent.toLocaleString()}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${category === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-50 text-gray-400'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {/* 修正ポイント：入力欄を固定幅(w-32)に、中央揃え(text-center)に変更 */}
                <input type="number" inputMode="numeric" placeholder="0" 
                  className="w-32 p-4 bg-gray-50 rounded-xl text-2xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all text-center"
                  value={expense} onChange={(e) => setExpense(e.target.value)} />
                {/* 修正ポイント：保存ボタンを最大幅(flex-1)に、文字を少し大きく(text-lg)変更 */}
                <button onClick={handlePayment} className="flex-1 bg-blue-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-100 active:scale-95 transition-all uppercase tracking-widest">
                  Save
                </button>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
              <p className="text-[10px] font-bold text-gray-400 mb-3 uppercase tracking-widest">Recent History</p>
              <div className="space-y-3">
                {history.slice(0, 3).map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b border-gray-50 pb-2">
                    <div>
                      <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded mr-2">{item.category}</span>
                      <span className="text-sm font-mono font-bold">¥{item.amount.toLocaleString()}</span>
                    </div>
                    <div className="flex gap-4">
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