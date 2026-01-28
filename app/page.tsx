"use client";
import React, { useState, useEffect } from 'react';
// フォルダ構成に合わせた正しい読み込みパス
import { db } from '../lib/firebase'; 
import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";

export default function Home() {
  // 基本設定（後で設定画面から変えられるようにします）
  const dailyBudget = 1000; // 1日1000円
  const payday = 25;       // 毎月25日開始

  const [balance, setBalance] = useState(0);
  const [expense, setExpense] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 【1】クラウドからデータを読み込む
    async function loadData() {
      try {
        const docRef = doc(db, "kakeibo", "user_data");
        const docSnap = await getDoc(docRef);
        
        // 支出合計を計算
        let totalExpense = 0;
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.history) {
            // 今回の給料日以降の支出だけを合計するロジック（簡易版）
            totalExpense = data.history.reduce((sum: number, item: any) => sum + item.amount, 0);
          }
        }

        // 【2】今日までの予算を計算
        const now = new Date();
        let startDate = new Date(now.getFullYear(), now.getMonth(), payday);
        if (now < startDate) {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, payday);
        }
        const diffTime = Math.abs(now.getTime() - startDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // 残金 = (1日の予算 × 経過日数) - 支出合計
        setBalance((diffDays * dailyBudget) - totalExpense);
      } catch (e) {
        console.error("読み込みエラー:", e);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // 支払いボタンを押した時の処理
  const handlePayment = async () => {
    const amount = Number(expense);
    if (!amount || amount <= 0) return;

    try {
      const docRef = doc(db, "kakeibo", "user_data");
      // Firebaseに支出を追加保存
      await setDoc(docRef, {
        history: arrayUnion({
          amount: amount,
          date: new Date().toISOString()
        })
      }, { merge: true });

      setBalance(prev => prev - amount);
      setExpense("");
      alert("クラウドに保存しました！");
    } catch (e) {
      alert("保存に失敗しました。Firebaseの設定を確認してください。");
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center">データを読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-6 text-gray-700 text-center">My家計簿マネージャー</h1>
        
        {/* 残高表示カード */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-400 p-8 rounded-3xl mb-8 shadow-xl text-white">
          <p className="text-sm opacity-90 mb-1">今日使えるお金</p>
          <p className="text-5xl font-mono font-bold italic">
            ¥{balance.toLocaleString()}
          </p>
        </div>
        
        {/* 入力エリア */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <label className="block text-xs text-gray-400 mb-2 uppercase font-bold">支出を記録</label>
          <div className="flex gap-2">
            <input 
              type="number" 
              inputMode="numeric"
              placeholder="0" 
              className="flex-1 p-4 bg-gray-50 rounded-xl text-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={expense}
              onChange={(e) => setExpense(e.target.value)}
            />
            <button 
              onClick={handlePayment}
              className="bg-blue-600 text-white px-6 rounded-xl font-bold active:scale-95 transition-transform"
            >
              保存
            </button>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 rounded-xl">
          <p className="text-xs text-blue-800 leading-relaxed">
            💡 <strong>仕組み:</strong><br />
            毎月{payday}日を基準に、1日¥{dailyBudget.toLocaleString()}ずつ予算が自動チャージされています。
          </p>
        </div>
      </div>
    </div>
  );
}