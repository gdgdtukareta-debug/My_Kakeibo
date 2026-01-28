"use client";
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase'; 
import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";

export default function Home() {
  // 状態管理
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [payday, setPayday] = useState(25);
  const [balance, setBalance] = useState(0);
  const [expense, setExpense] = useState("");
  const [category, setCategory] = useState("食費"); // デフォルトの分類
  const [loading, setLoading] = useState(true);
  const [isSettingMode, setIsSettingMode] = useState(false); // 設定画面の切り替え

  const categories = ["食費", "日用品", "趣味", "仕事", "その他"];

  // データの読み込み
  const loadData = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      const docSnap = await getDoc(docRef);
      
      let currentBudget = 1000;
      let currentPayday = 25;
      let totalExpense = 0;

      if (docSnap.exists()) {
        const data = docSnap.data();
        // 予算と給料日の設定があれば読み込む
        if (data.settings) {
          currentBudget = data.settings.dailyBudget || 1000;
          currentPayday = data.settings.payday || 25;
          setDailyBudget(currentBudget);
          setPayday(currentPayday);
        }
        // 支出履歴から合計を計算
        if (data.history) {
          totalExpense = data.history.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);
        }
      }

      const now = new Date();
      let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
      if (now < startDate) {
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
      }
      const diffTime = Math.abs(now.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      setBalance((diffDays * currentBudget) - totalExpense);
    } catch (e) {
      console.error("読み込みエラー:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 支出の保存
  const handlePayment = async () => {
    const amount = Number(expense);
    if (!amount || amount <= 0) return;

    try {
      const docRef = doc(db, "kakeibo", "user_data");
      await setDoc(docRef, {
        history: arrayUnion({
          amount: amount,
          category: category, // 分類を保存
          date: new Date().toISOString()
        })
      }, { merge: true });

      setBalance(prev => prev - amount);
      setExpense("");
      alert(`${category}として ¥${amount} を保存しました！`);
    } catch (e) {
      alert("保存に失敗しました。");
    }
  };

  // 予算・給料日の設定保存
  const saveSettings = async () => {
    try {
      const docRef = doc(db, "kakeibo", "user_data");
      await setDoc(docRef, {
        settings: {
          dailyBudget: dailyBudget,
          payday: payday
        }
      }, { merge: true });
      setIsSettingMode(false);
      loadData(); // 再計算のために再読み込み
      alert("設定を更新しました！");
    } catch (e) {
      alert("設定の保存に失敗しました。");
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans text-gray-900">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-gray-700">My家計簿</h1>
          <button 
            onClick={() => setIsSettingMode(!isSettingMode)}
            className="text-sm text-blue-600 font-bold"
          >
            {isSettingMode ? "閉じる" : "予算設定"}
          </button>
        </div>
        
        {isSettingMode ? (
          /* 設定画面 */
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 mb-8">
            <h2 className="font-bold mb-4 text-blue-800">基本設定</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">1日の予算 (円)</label>
                <input type="number" className="w-full p-3 bg-gray-50 rounded-xl" 
                  value={dailyBudget} onChange={(e) => setDailyBudget(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">給料日 (日)</label>
                <input type="number" className="w-full p-3 bg-gray-50 rounded-xl" 
                  value={payday} onChange={(e) => setPayday(Number(e.target.value))} />
              </div>
              <button onClick={saveSettings} className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold">
                設定を保存する
              </button>
            </div>
          </div>
        ) : (
          /* メイン画面 */
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-400 p-8 rounded-3xl mb-8 shadow-xl text-white">
              <p className="text-sm opacity-90 mb-1">今日使えるお金</p>
              <p className="text-5xl font-mono font-bold italic">¥{balance.toLocaleString()}</p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <label className="block text-xs text-gray-400 mb-3 uppercase font-bold">分類を選択</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input type="number" inputMode="numeric" placeholder="金額を入力" 
                  className="flex-1 p-4 bg-gray-50 rounded-xl text-2xl outline-none"
                  value={expense} onChange={(e) => setExpense(e.target.value)} />
                <button onClick={handlePayment} className="bg-blue-600 text-white px-6 rounded-xl font-bold active:scale-95">
                  保存
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}