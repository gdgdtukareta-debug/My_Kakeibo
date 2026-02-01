"use client";
import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase'; 
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

// --- 型定義 ---
type Transaction = {
  amount: number;
  category: string;
  memo: string;
  date: string; 
  type?: 'expense' | 'income' | 'transfer';
};

type Subscription = {
  id: number;
  name: string;
  amount: number;
  payDay: number | ""; 
  category: string;
  lastPaidMonth: string; 
};

type ThemeOption = 'light' | 'dark' | 'system';
type BudgetMode = 'daily' | 'monthly'; // 新追加: 予算モード

type Archives = { [key: string]: Transaction[] };

export default function Home() {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- 基本設定 State ---
  const [totalMonthlyIncome, setTotalMonthlyIncome] = useState(0); // 1ヶ月の総予算（計算用）
  const [livingBudgetMode, setLivingBudgetMode] = useState<BudgetMode>('daily'); // 生活費モード
  const [dailyBudget, setDailyBudget] = useState(1000);   // 日割り予算
  const [monthlyLivingBudget, setMonthlyLivingBudget] = useState(30000); // 月予算（新設）
  
  const [payday, setPayday] = useState(25);
  const [monthlySavingTarget, setMonthlySavingTarget] = useState(0); 
  const [monthlyInvestmentTarget, setMonthlyInvestmentTarget] = useState(0); 
  
  // --- 資産 State ---
  const [balance, setBalance] = useState(0);            
  const [savings, setSavings] = useState(0);            
  const [investCash, setInvestCash] = useState(0);      
  const [investStock, setInvestStock] = useState(0);    
  const [totalSpent, setTotalSpent] = useState(0);

  // --- NISA & Subscriptions ---
  const [nisaSettings, setNisaSettings] = useState({ enabled: false, amount: 0, day: 1, lastProcessedMonth: "" });
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  
  // --- UI State ---
  const [expense, setExpense] = useState("");
  const [memo, setMemo] = useState(""); 
  const [category, setCategory] = useState("食費");
  const [inputDate, setInputDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSettingMode, setIsSettingMode] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [archives, setArchives] = useState<Archives>({});
  const [isCsvMode, setIsCsvMode] = useState(false);
  
  // --- テーマ & リセット用 ---
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [tempResetValues, setTempResetValues] = useState({ special: 0, investCash: 0, investStock: 0 });

  const categories = ["食費", "日用品", "趣味", "仕事", "その他", "特別支出", "投資", "貯金", "臨時収入"];

  // --- 初期化 & Auth監視 ---
  useEffect(() => {
    const today = new Date();
    setInputDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (t: ThemeOption) => {
      const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) root.classList.add('dark');
      else root.classList.remove('dark');
    };
    applyTheme(theme);
  }, [theme]);

  // --- ログイン処理 ---
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Failed", error);
      alert("ログインに失敗しました");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setHistory([]);
      setBalance(0);
      setSavings(0);
      setInvestCash(0);
      setInvestStock(0);
    } catch (error) { console.error(error); }
  };

  // --- 5:2:3 自動計算ロジック ---
  const calculateBudgetDistribution = () => {
    if (totalMonthlyIncome <= 0) {
      alert("総予算を入力してください");
      return;
    }
    // 5:2:3 の割合
    const living = Math.floor(totalMonthlyIncome * 0.5);
    const special = Math.floor(totalMonthlyIncome * 0.2);
    const invest = Math.floor(totalMonthlyIncome * 0.3);

    // Stateに反映
    if (livingBudgetMode === 'daily') {
      setDailyBudget(Math.floor(living / 30)); // 単純に30日で割る
    } else {
      setMonthlyLivingBudget(living);
    }
    setMonthlySavingTarget(special);
    setMonthlyInvestmentTarget(invest);
  };

  // --- データ読み込み & 自動処理 ---
  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      
      let currentBudget = 1000;
      let currentMonthlyLiving = 30000;
      let currentMode: BudgetMode = 'daily';
      
      let currentPayday = 25;
      let currentMonthlySaving = 0;
      let currentMonthlyInvestment = 0;
      
      let currentSavings = 0;
      let currentInvestCash = 0;
      let currentInvestStock = 0; 
      let rawHistory: Transaction[] = [];
      let currentArchives: Archives = {};
      let currentSubs: Subscription[] = [];
      let currentNisa = { enabled: false, amount: 0, day: 1, lastProcessedMonth: "" };
      let lastAccessedMonth = "";

      if (docSnap.exists()) {
        const data = docSnap.data();
        const s = data.settings || {};
        
        currentBudget = s.dailyBudget || 1000;
        currentMonthlyLiving = s.monthlyLivingBudget || 30000;
        currentMode = s.livingBudgetMode || 'daily';
        
        currentPayday = s.payday || 25;
        currentMonthlySaving = s.monthlySavingTarget || 0;
        currentMonthlyInvestment = s.monthlyInvestmentTarget || 0;
        lastAccessedMonth = s.lastAccessedMonth || "";
        setTheme(s.theme || 'system');
        setIsCsvMode(s.isCsvMode || false);
        currentNisa = s.nisaSettings || currentNisa;

        // State復元
        setDailyBudget(currentBudget);
        setMonthlyLivingBudget(currentMonthlyLiving);
        setLivingBudgetMode(currentMode);
        
        setPayday(currentPayday);
        setMonthlySavingTarget(currentMonthlySaving);
        setMonthlyInvestmentTarget(currentMonthlyInvestment);
        setNisaSettings(currentNisa);

        currentSavings = data.savings_balance || 0;
        currentInvestCash = data.invest_cash_balance ?? (data.investment_balance || 0);
        currentInvestStock = data.invest_stock_balance || 0;
        
        rawHistory = data.history || [];
        currentArchives = data.archives || {};
        currentSubs = data.subscriptions || [];
      } else {
        await setDoc(docRef, { savings_balance: 0, invest_cash_balance: 0, invest_stock_balance: 0, history: [], settings: {}, archives: [], subscriptions: [] });
      }

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;

      // 1. 月替わり判定
      let isMonthChanged = false;
      if (lastAccessedMonth !== "" && lastAccessedMonth !== currentMonthKey) {
        
        // --- 余剰金計算 (モードによって異なる) ---
        const prevRegularSpent = rawHistory
          .filter(item => !["特別支出", "投資", "貯金", "臨時収入"].includes(item.category))
          .reduce((sum, item) => sum + item.amount, 0);

        let surplus = 0;
        if (currentMode === 'daily') {
            // 日割りモード: 経過日数分 - 使用額
            const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
            const diffDays = Math.ceil(Math.abs(now.getTime() - lastMonthDate.getTime()) / (1000 * 60 * 60 * 24));
            surplus = (diffDays * currentBudget) - prevRegularSpent;
        } else {
            // 月予算モード: 月予算 - 使用額
            surplus = currentMonthlyLiving - prevRegularSpent;
        }

        // 特別費へは「月次固定額」のみ繰越
        currentSavings += currentMonthlySaving;
        // 投資・貯金へ「月次固定額」 + 「生活費の余り」を繰越
        currentInvestCash += currentMonthlyInvestment + (surplus > 0 ? surplus : 0);

        currentArchives[lastAccessedMonth] = rawHistory;
        const sortedKeys = Object.keys(currentArchives).sort();
        if (sortedKeys.length > 6) {
          const newArchives: Archives = {};
          sortedKeys.slice(-6).forEach(key => newArchives[key] = currentArchives[key]);
          currentArchives = newArchives;
        }

        rawHistory = [];
        isMonthChanged = true;
      }

      // 2. サブスク自動支払い
      let dataModified = false;
      const todayDate = now.getDate();
      
      const updatedSubs = currentSubs.map(sub => {
        const isDue = sub.lastPaidMonth !== currentMonthKey;
        const isTime = sub.payDay === "" || todayDate >= (sub.payDay as number);

        if (isDue && isTime) {
          dataModified = true;
          const expense = sub.amount;
          if (sub.category === "特別支出") currentSavings -= expense;
          else if (sub.category === "貯金") currentInvestCash -= expense;
          
          rawHistory.push({
            amount: expense, category: sub.category, memo: `[Sub] ${sub.name}`, date: now.toISOString(), type: 'expense'
          });
          return { ...sub, lastPaidMonth: currentMonthKey };
        }
        return sub;
      });

      // 3. NISA自動積立
      if (currentNisa.enabled && currentNisa.lastProcessedMonth !== currentMonthKey && todayDate >= currentNisa.day) {
        dataModified = true;
        currentInvestCash -= currentNisa.amount;
        currentInvestStock += currentNisa.amount;
        
        rawHistory.push({
          amount: currentNisa.amount,
          category: "投資",
          memo: "[Auto] NISA積立",
          date: now.toISOString(),
          type: 'transfer' 
        });
        currentNisa.lastProcessedMonth = currentMonthKey;
        setNisaSettings(currentNisa);
      }

      if (isMonthChanged || dataModified || lastAccessedMonth === "") {
        await updateDoc(docRef, {
          savings_balance: currentSavings,
          invest_cash_balance: currentInvestCash,
          invest_stock_balance: currentInvestStock,
          history: rawHistory,
          archives: currentArchives,
          subscriptions: updatedSubs,
          "settings.lastAccessedMonth": currentMonthKey,
          "settings.nisaSettings": currentNisa
        });
      }

      setSavings(currentSavings);
      setInvestCash(currentInvestCash);
      setInvestStock(currentInvestStock);
      setSubscriptions(updatedSubs);
      setArchives(currentArchives);
      setTempResetValues({ special: currentSavings, investCash: currentInvestCash, investStock: currentInvestStock });

      const sortedHistory = [...rawHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sortedHistory);

      // --- 残高計算 (モード別) ---
      const catTotals: { [key: string]: number } = {};
      categories.forEach(c => catTotals[c] = 0);
      let totalAll = 0;
      let totalRegular = 0;

      rawHistory.forEach(item => {
        if (item.type !== 'transfer') {
            totalAll += item.amount;
            catTotals[item.category] = (catTotals[item.category] || 0) + item.amount;
            if (!["特別支出", "投資", "貯金", "臨時収入"].includes(item.category)) {
              totalRegular += item.amount;
            }
        }
      });
      setTotalSpent(totalAll);
      
      let currentBalance = 0;
      if (currentMode === 'daily') {
          // 毎日積み上げモード
          let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
          if (now < startDate) startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
          const daysFromStart = Math.floor(Math.abs(now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          currentBalance = (daysFromStart * currentBudget) - totalRegular;
      } else {
          // 月予算モード (予算総額 - 使用額)
          currentBalance = currentMonthlyLiving - totalRegular;
      }
      setBalance(currentBalance);

      setChartData({
        labels: categories,
        datasets: [{
          data: categories.map(c => catTotals[c]),
          backgroundColor: currentBalance < 0 
            ? ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b', '#db2777', '#4338ca', '#0d9488', '#059669']
            : ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#84cc16'],
          borderWidth: 0,
        }]
      });

    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (user) { loadData(); }
  }, [user]);

  // --- 支払い処理 ---
  const handlePayment = async () => {
    if (!user) return;
    const amount = Number(expense);
    if (!amount || amount <= 0) return;
    try {
      const docRef = doc(db, "users", user.uid);
      let newSavings = savings;
      let newInvestCash = investCash;
      let newInvestStock = investStock;
      let type: 'expense' | 'income' | 'transfer' = 'expense';

      if (category === "特別支出") {
        newSavings -= amount;
      } else if (category === "貯金") {
        newInvestCash -= amount;
      } else if (category === "投資") {
        newInvestCash -= amount;
        newInvestStock += amount;
        type = 'transfer';
      } else if (category === "臨時収入") {
        newInvestCash += amount;
        type = 'income';
      }

      const recordDate = new Date(inputDate);
      const now = new Date();
      recordDate.setHours(now.getHours(), now.getMinutes());

      const newHistory = [...history, { 
        amount, category, memo, date: recordDate.toISOString(), type
      }];

      await updateDoc(docRef, { 
        history: newHistory,
        savings_balance: newSavings,
        invest_cash_balance: newInvestCash,
        invest_stock_balance: newInvestStock
      });
      
      setExpense("");
      setMemo("");
      loadData();
    } catch (e) { alert("保存に失敗しました"); }
  };

  // --- 設定更新 ---
  const handleUpdateSettings = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, "users", user.uid);
      const confirmAdd = confirm(`設定を更新しますか？\n(残高リセット値も適用されます)`);
      if (!confirmAdd) return;
      
      const newSettings = { 
        dailyBudget, monthlyLivingBudget, livingBudgetMode, payday, 
        monthlySavingTarget, monthlyInvestmentTarget, 
        isCsvMode, theme, nisaSettings,
        lastAccessedMonth: `${new Date().getFullYear()}-${new Date().getMonth()}` 
      };
      
      await updateDoc(docRef, { 
        settings: newSettings, 
        subscriptions: subscriptions,
        savings_balance: tempResetValues.special,
        invest_cash_balance: tempResetValues.investCash,
        invest_stock_balance: tempResetValues.investStock,
      });

      setIsSettingMode(false);
      loadData();
    } catch (e) { alert("更新失敗"); }
  };

  const deleteItem = async (index: number) => {
    if (!user) return;
    if (!confirm("削除しますか？")) return;
    const item = history[index];
    let ns = savings, nic = investCash, nis = investStock;
    if (item.category === "特別支出") ns += item.amount;
    else if (item.category === "貯金") nic += item.amount;
    else if (item.category === "投資") { nic += item.amount; nis -= item.amount; }
    else if (item.category === "臨時収入") nic -= item.amount;

    const newH = history.filter((_, i) => i !== index);
    await updateDoc(doc(db, "users", user.uid), { history: newH, savings_balance: ns, invest_cash_balance: nic, invest_stock_balance: nis });
    loadData();
  };

  const downloadCSV = () => {
    let allData = [...history, ...Object.values(archives).flat()];
    allData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let csv = "Date,Category,Amount,Memo,Type\n";
    allData.forEach(i => csv += `${new Date(i.date).toLocaleDateString()},${i.category},${i.amount},"${i.memo}",${i.type || 'expense'}\n`);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kakeibo_export.csv`;
    link.click();
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 font-mono">Loading App...</div>;

  // --- ログイン画面 ---
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-gray-100 dark:border-gray-700">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight mb-1">3つの財布</h1>
            <p className="text-xs text-gray-400 font-mono tracking-widest uppercase">Financial Partner</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">ログインして家計簿データを同期しましょう。</p>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-white py-3 px-4 rounded-xl transition-all shadow-sm font-bold text-sm mb-8"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Googleでログイン
          </button>

          {/* このアプリについて (プレースホルダー) */}
          <div className="text-left border-t border-gray-100 dark:border-gray-700 pt-6">
            <h3 className="text-xs font-bold text-gray-500 mb-2">このアプリについて</h3>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl text-xs text-gray-400 min-h-[100px] border border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center">
              富裕層も実践する「3つの財布」管理術<br /><br />「支出の額は、収入の額に達するまで膨張する」というパーキンソンの法則を避けるため、お金を物理的に3つの財布（生活費・特別費・投資）に分けるアプリです。<br /><br />収入を5:2:3の黄金比率で自動配分し、「あらかじめ投資をして、残ったお金で生活する」仕組みを確立。メンタルアカウンティング（心の会計）の罠に陥ることなく、無理なく資産形成が進む家計管理をサポートします。
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 font-mono">Loading Data...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 font-sans text-gray-800 dark:text-gray-100 pb-10">
      <div className="max-w-md mx-auto p-4">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pt-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight dark:text-white">3つの財布</h1>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-widest uppercase">
              Hi, {user.displayName?.split(" ")[0]}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLogout} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-full shadow-sm hover:bg-gray-50 transition-all text-xs font-bold text-gray-500">
                LOGOUT
            </button>
            <button onClick={() => setIsSettingMode(!isSettingMode)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded-full shadow-sm hover:bg-gray-50 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-300"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        {isSettingMode ? (
          // --- 設定画面 ---
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden animation-fade-in">
             <div className="bg-blue-600 p-4 text-center">
               <h2 className="text-white font-bold text-sm tracking-widest uppercase">Settings</h2>
             </div>
             <div className="p-6 space-y-8 max-h-[75vh] overflow-y-auto">
               
               {/* 1. 基本予算設定 */}
               <section>
                 <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-3 border-b border-blue-100 dark:border-blue-900 pb-1">基本予算設定</h3>
                 
                 {/* 5:2:3 自動計算ツール */}
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl mb-4">
                    <label className="text-[10px] text-blue-500 font-bold block mb-1">1ヶ月の総収入から自動振り分け (5:2:3)</label>
                    <div className="flex gap-2">
                        <input type="number" placeholder="例: 300000" className="flex-1 p-2 bg-white dark:bg-gray-700 rounded text-sm" 
                            value={totalMonthlyIncome} onChange={(e)=>setTotalMonthlyIncome(Number(e.target.value))} />
                        <button onClick={calculateBudgetDistribution} className="bg-blue-600 text-white text-xs font-bold px-3 rounded shadow-sm">
                            反映
                        </button>
                    </div>
                    <p className="text-[9px] text-blue-400 mt-1">※生活費(5割)、特別費(2割)、貯金投資(3割)を下記に入力します。</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   {/* モード切替 */}
                   <div className="col-span-2 flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                       <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300">生活費予算モード</span>
                       <div className="flex gap-1">
                           <button onClick={()=>setLivingBudgetMode('daily')} className={`px-2 py-1 text-[10px] rounded ${livingBudgetMode==='daily' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>日割(積上)</button>
                           <button onClick={()=>setLivingBudgetMode('monthly')} className={`px-2 py-1 text-[10px] rounded ${livingBudgetMode==='monthly' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>月額(減算)</button>
                       </div>
                   </div>

                   {livingBudgetMode === 'daily' ? (
                       <div>
                         <label className="text-[10px] text-gray-400 block mb-1">1日の生活費予算</label>
                         <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={dailyBudget} onChange={(e)=>setDailyBudget(Number(e.target.value))} />
                       </div>
                   ) : (
                       <div>
                         <label className="text-[10px] text-gray-400 block mb-1">1ヶ月の生活費予算</label>
                         <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlyLivingBudget} onChange={(e)=>setMonthlyLivingBudget(Number(e.target.value))} />
                       </div>
                   )}

                   <div>
                     <label className="text-[10px] text-gray-400 block mb-1">給料日</label>
                     <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={payday} onChange={(e)=>setPayday(Number(e.target.value))} />
                   </div>
                   <div>
                     <label className="text-[10px] text-gray-400 block mb-1">特別費積立(月)</label>
                     <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlySavingTarget} onChange={(e)=>setMonthlySavingTarget(Number(e.target.value))} />
                   </div>
                   <div>
                     <label className="text-[10px] text-gray-400 block mb-1">貯金・投資積立(月)</label>
                     <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlyInvestmentTarget} onChange={(e)=>setMonthlyInvestmentTarget(Number(e.target.value))} />
                   </div>
                 </div>
               </section>

               {/* 2. 残高リセット */}
               <section>
                 <h3 className="text-xs font-bold text-red-500 uppercase mb-3 border-b border-red-100 dark:border-red-900 pb-1">残高修正 (リセット)</h3>
                 <p className="text-[10px] text-gray-400 mb-2">※現在の計算と実際の残高がズレている場合、ここで入力した値に強制変更されます。</p>
                 <div className="space-y-3">
                   <div className="flex items-center justify-between">
                     <label className="text-xs font-bold text-gray-600 dark:text-gray-300">特別費 残高</label>
                     <input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" 
                       value={tempResetValues.special} onChange={(e)=>setTempResetValues({...tempResetValues, special: Number(e.target.value)})} />
                   </div>
                   <div className="flex items-center justify-between">
                     <label className="text-xs font-bold text-gray-600 dark:text-gray-300">貯金(現金) 残高</label>
                     <input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" 
                       value={tempResetValues.investCash} onChange={(e)=>setTempResetValues({...tempResetValues, investCash: Number(e.target.value)})} />
                   </div>
                   <div className="flex items-center justify-between">
                     <label className="text-xs font-bold text-gray-600 dark:text-gray-300">投資(資産) 残高</label>
                     <input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" 
                       value={tempResetValues.investStock} onChange={(e)=>setTempResetValues({...tempResetValues, investStock: Number(e.target.value)})} />
                   </div>
                 </div>
               </section>

               {/* 3. NISA & Subscriptions */}
               <section>
                  <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-3 border-b border-indigo-100 dark:border-indigo-900 pb-1">自動積立・固定費</h3>
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">NISA自動積立</span>
                        <input type="checkbox" checked={nisaSettings.enabled} onChange={(e)=>setNisaSettings({...nisaSettings, enabled: e.target.checked})} className="toggle" />
                    </div>
                    {nisaSettings.enabled && (
                        <div className="flex gap-2">
                            <input type="number" placeholder="金額" className="flex-1 p-2 rounded text-xs" value={nisaSettings.amount} onChange={(e)=>setNisaSettings({...nisaSettings, amount: Number(e.target.value)})} />
                            <input type="number" placeholder="日" className="w-16 p-2 rounded text-xs" value={nisaSettings.day} onChange={(e)=>setNisaSettings({...nisaSettings, day: Number(e.target.value)})} />
                        </div>
                    )}
                    <p className="text-[9px] text-indigo-400 mt-1">※設定日に「貯金」から「投資」へ自動振替します。</p>
                  </div>
                  <div className="mb-2">
                      <div className="flex justify-between items-center mb-2">
                          <label className="text-[10px] text-gray-400 font-bold uppercase">サブスクリプション</label>
                          <button onClick={()=>{
                              const n = prompt("名称"); if(!n)return;
                              const a = prompt("金額"); if(!a)return;
                              const d = prompt("支払日(1-31, 空欄で月替わり)"); 
                              const c = prompt("カテゴリ", "その他");
                              setSubscriptions([...subscriptions, {id: Date.now(), name: n, amount: Number(a), payDay: d?Number(d):"", category:c||"その他", lastPaidMonth:""}]);
                          }} className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded font-bold">追加</button>
                      </div>
                      <div className="space-y-1">
                          {subscriptions.map(s => (
                              <div key={s.id} className="flex justify-between text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                  <span>{s.name} (¥{s.amount})</span>
                                  <button onClick={()=>setSubscriptions(subscriptions.filter(i=>i.id!==s.id))} className="text-red-400">削除</button>
                              </div>
                          ))}
                      </div>
                  </div>
               </section>

               {/* 4. 表示・その他 */}
               <section>
                   <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">表示設定</h3>
                   <div className="flex gap-2 mb-4">
                       {(['light', 'dark', 'system'] as ThemeOption[]).map(t => (
                           <button key={t} onClick={()=>setTheme(t)} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme===t ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                               {t === 'light' ? 'ライト' : t === 'dark' ? 'ダーク' : '自動'}
                           </button>
                       ))}
                   </div>
                   <div className="flex items-center justify-between">
                       <span className="text-xs text-gray-500">CSV出力機能</span>
                       <input type="checkbox" checked={isCsvMode} onChange={(e)=>setIsCsvMode(e.target.checked)} />
                   </div>
                   {isCsvMode && <button onClick={downloadCSV} className="mt-2 text-xs text-green-600 underline">過去データのダウンロード</button>}
               </section>

               <button onClick={handleUpdateSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold text-sm shadow-lg transition-transform active:scale-95">設定を保存して戻る</button>
             </div>
          </div>
        ) : (
          // --- メイン画面 ---
          <div className="space-y-6 animate-fade-in-up">
            
            {/* 1. ダッシュボード */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-blue-50 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <p className="text-[10px] font-bold text-blue-400 dark:text-blue-300 mb-1 uppercase tracking-wider relative z-10">生活費残高</p>
                  <p className={`text-2xl font-mono font-bold relative z-10 ${balance < 0 ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>¥{balance.toLocaleString()}</p>
                  <p className="text-[8px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                      {livingBudgetMode === 'daily' ? 'Daily Accumulation' : 'Monthly Budget'}
                  </p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-pink-50 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-pink-50 dark:bg-pink-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <p className="text-[10px] font-bold text-pink-400 dark:text-pink-300 mb-1 uppercase tracking-wider relative z-10">特別費プール</p>
                  <p className="text-2xl font-mono font-bold text-gray-800 dark:text-white relative z-10">¥{savings.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 rounded-3xl shadow-lg text-white relative overflow-hidden">
                <div className="absolute opacity-10 top-[-20px] left-[-20px] w-32 h-32 bg-white rounded-full blur-2xl"></div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3 opacity-90">
                        <p className="text-[10px] font-bold uppercase tracking-widest">貯金と投資</p>
                        <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded backdrop-blur-sm">Total: ¥{(investCash + investStock).toLocaleString()}</span>
                    </div>
                    <div className="flex divide-x divide-white/20">
                        <div className="pr-4 flex-1">
                            <p className="text-[9px] opacity-70 mb-0.5">現金 (貯金)</p>
                            <p className="text-xl font-mono font-bold">¥{investCash.toLocaleString()}</p>
                        </div>
                        <div className="pl-4 flex-1">
                            <p className="text-[9px] opacity-70 mb-0.5">投資 (資産)</p>
                            <p className="text-xl font-mono font-bold">¥{investStock.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. 入力エリア */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex flex-wrap gap-2 mb-4 justify-center">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                      category === cat 
                        ? (['投資','貯金','臨時収入'].includes(cat) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' : cat === '特別支出' ? 'bg-pink-500 text-white shadow-md shadow-pink-200 dark:shadow-none' : 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none') 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                   <div className="relative w-36">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">¥</span>
                       <input type="number" inputMode="numeric" placeholder="0" 
                        className="w-full pl-6 pr-3 py-4 bg-gray-50 dark:bg-gray-900 rounded-2xl text-xl font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center dark:text-white"
                        value={expense} onChange={(e) => setExpense(e.target.value)} />
                   </div>
                  
                  <div className="flex-1 flex flex-col gap-2">
                     <input type="date" 
                        className="w-full p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-[10px] font-mono text-gray-500 dark:text-gray-400 outline-none text-center"
                        value={inputDate} onChange={(e) => setInputDate(e.target.value)}
                     />
                     <button onClick={handlePayment} className={`h-full text-white rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all uppercase tracking-widest ${['投資','貯金','臨時収入'].includes(category) ? 'bg-indigo-600' : category === '特別支出' ? 'bg-pink-500' : 'bg-blue-600'}`}>
                       決定
                     </button>
                  </div>
                </div>
                <input type="text" placeholder="メモを入力..."
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs outline-none focus:bg-white dark:focus:bg-gray-700 transition-colors dark:text-white"
                  value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
            </div>

            {/* 3. 履歴リスト */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-4 uppercase tracking-widest">直近の履歴</h3>
              <div className="space-y-4">
                {history.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-start justify-between border-b border-gray-50 dark:border-gray-700 pb-3 last:border-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${['投資','貯金','臨時収入'].includes(item.category) ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' : item.category === '特別支出' ? 'bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>{item.category}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{new Date(item.date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-mono font-bold ${item.category === '臨時収入' ? 'text-green-500' : 'text-gray-700 dark:text-gray-200'}`}>
                            {item.category === '臨時収入' ? '+' : ''}¥{item.amount.toLocaleString()}
                          </span>
                          {item.type === 'transfer' && <span className="text-[8px] text-indigo-400 bg-indigo-50 dark:bg-indigo-900/50 px-1 rounded">振替</span>}
                      </div>
                      {item.memo && <p className="text-[10px] text-gray-400 mt-0.5">{item.memo}</p>}
                    </div>
                    <button onClick={() => deleteItem(index)} className="text-gray-300 hover:text-red-400 transition-colors p-2">
                        <span className="text-[10px] font-bold">×</span>
                    </button>
                  </div>
                ))}
                {history.length === 0 && <p className="text-center text-xs text-gray-300 py-4">履歴はありません</p>}
              </div>
            </div>

            {/* 4. グラフ */}
            {chartData && totalSpent > 0 && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-6 uppercase tracking-widest text-center">今月の内訳</h3>
                <div className="px-12 pb-4">
                  <Pie data={chartData} options={{ 
                      plugins: { 
                          legend: { 
                              position: 'bottom', 
                              labels: { boxWidth: 8, font: { size: 9 }, color: theme === 'dark' ? '#9ca3af' : '#4b5563' } 
                          } 
                      },
                      elements: { arc: { borderWidth: 0 } }
                  }} />
                </div>
              </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}