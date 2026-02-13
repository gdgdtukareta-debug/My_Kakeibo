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
type BudgetMode = 'daily' | 'monthly';

type Archives = { [key: string]: Transaction[] };

// --- Tactics Mode 定義コンテンツ (分割) ---
const UncontrolContent = () => (
  <div className="border-l-4 border-blue-500 pl-3">
    <h4 className="font-bold text-blue-600 dark:text-blue-400 mb-1 text-sm flex items-center gap-2">
      <span>🛡️</span> 1. 【義務】アンコントロール領域
      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded ml-auto">旧：生活費</span>
    </h4>
    <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">
      「自分の意思では金額も時期もコントロールできない出費」
    </p>
    <p className="mb-2 opacity-80">
      払わないと社会生活や健康に即座に悪影響が出るもの。ここは予算をオーバーしても仕方がない「聖域」です。
    </p>
    <div className="bg-white dark:bg-gray-700/50 p-3 rounded-lg space-y-1">
      <p><span className="font-bold text-blue-500">医療費・薬代</span>：風邪や歯医者はタイミングを選べません。</p>
      <p><span className="font-bold text-blue-500">会費</span>：組織に属する以上、強制徴収です。</p>
      <p><span className="font-bold text-blue-500">冠婚葬祭</span>：避けることができません。</p>
      <p><span className="font-bold text-blue-500">サブスク・QOL維持</span>：自動引き落としや、毎日のコーヒーなど。</p>
    </div>
  </div>
);

const ControlContent = () => (
  <div className="border-l-4 border-pink-500 pl-3">
    <h4 className="font-bold text-pink-600 dark:text-pink-400 mb-1 text-sm flex items-center gap-2">
      <span>🎮</span> 2. 【裁量】コントロール領域
      <span className="text-[10px] bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded ml-auto">旧：特別費</span>
    </h4>
    <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">
      「買うか買わないか、あるいは金額を自分で決められる出費」
    </p>
    <p className="mb-2 opacity-80">
      ここが調整弁です。「義務」の出費が多かった月は、ここを削って枠内に収めます。
    </p>
    <div className="bg-white dark:bg-gray-700/50 p-3 rounded-lg space-y-1">
      <p><span className="font-bold text-pink-500">ジュースのストック</span>：「今月買うか、来月まで我慢して水道水にするか」は選べます。</p>
      <p><span className="font-bold text-pink-500">家族との外食</span>：「行く・行かない」「スシローか公園か」を選べます。</p>
      <p><span className="font-bold text-pink-500">ガジェット・PCパーツ</span>：完全に自分の意思です。</p>
      <p><span className="font-bold text-pink-500">自分だけのおやつ</span>：我慢すれば0円にできます。</p>
    </div>
  </div>
);

// --- Tactics Guide コンポーネント (統合版) ---
const TacticsGuide = ({ type }: { type: 'uncontrol' | 'control' | 'all' }) => (
  <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 leading-relaxed space-y-6">
    {(type === 'all' || type === 'uncontrol') && <UncontrolContent />}
    {(type === 'all' || type === 'control') && <ControlContent />}
  </div>
);

// --- 使い方ガイドコンポーネント (共通化) ---
const HelpGuide = () => (
  <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 leading-relaxed space-y-6">
    
    {/* コンセプト */}
    <div>
      <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-2 text-sm">
        <span className="text-lg">👛</span> 3つの財布とは？
      </h4>
      <p>
        お金を「使う目的」に合わせて3つに分けて管理する方法です。
      </p>
      <ul className="mt-2 space-y-1 list-disc list-inside text-gray-500 dark:text-gray-400 pl-1">
        <li><span className="font-bold text-blue-500">生活費</span>：食費や日用品など、日々消えていくお金。</li>
        <li><span className="font-bold text-pink-500">特別費</span>：旅行や家電、冠婚葬祭など、人生を豊かにするお金。</li>
        <li><span className="font-bold text-indigo-500">貯金・投資</span>：未来のために守り、増やすお金。</li>
      </ul>
    </div>

    {/* ステップ1: 設定 */}
    <div>
      <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
        <span className="bg-gray-200 dark:bg-gray-700 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">1</span>
        まずは予算を設定
      </h4>
      <p className="mb-1">
        右上の設定ボタン(歯車)を開き、<span className="font-bold">「1ヶ月の総収入」</span>を入力して<span className="bg-blue-600 text-white px-1 py-0.5 rounded text-[10px]">反映</span>を押してください。
      </p>
      <p className="text-[10px] text-gray-400">
        ※自動的に黄金比率（5:2:3）で各財布に予算が振り分けられます。
      </p>
    </div>

    {/* ステップ2: 入力 */}
    <div>
      <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
        <span className="bg-gray-200 dark:bg-gray-700 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">2</span>
        使ったお金を入力
      </h4>
      <p>
        <span className="font-bold">「カテゴリ」</span>を選んで、金額を入力して<span className="bg-blue-600 text-white px-1 py-0.5 rounded text-[10px]">決定</span>を押すだけ。
      </p>
      <p className="mt-1 text-[10px] text-gray-400">
        選んだカテゴリに合わせて、自動的に正しい財布（生活費や特別費）から残高が引かれます。
      </p>
    </div>

    {/* ステップ3: 修正 */}
    <div>
      <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
        <span className="bg-gray-200 dark:bg-gray-700 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">3</span>
        間違えたときは？
      </h4>
      <p>
        履歴リストにある<span className="font-bold">「鉛筆マーク✏️」</span>で修正、<span className="font-bold">「×マーク」</span>で削除ができます。残高も自動で元に戻ります。
      </p>
    </div>
  </div>
);

export default function Home() {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- 基本設定 State ---
  const [totalMonthlyIncome, setTotalMonthlyIncome] = useState(0);
  const [livingBudgetMode, setLivingBudgetMode] = useState<BudgetMode>('daily');
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [monthlyLivingBudget, setMonthlyLivingBudget] = useState(30000);
  
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
  const [showAllHistory, setShowAllHistory] = useState(false); 
  const [isTacticsMode, setIsTacticsMode] = useState(false); // New: Tactics Mode
  
  // --- モーダル用 State ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ amount: 0, category: "", memo: "", date: "" });
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false); 
  // 変更: ガイドの種類を管理するState ('uncontrol' | 'control' | 'all' | null)
  const [tacticsGuideType, setTacticsGuideType] = useState<'uncontrol' | 'control' | 'all' | null>(null);

  // --- テーマ & リセット用 ---
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [tempResetValues, setTempResetValues] = useState({ special: 0, investCash: 0, investStock: 0 });

  const normalCategories = ["食費", "日用品", "趣味", "仕事", "その他", "特別支出", "投資", "貯金", "臨時収入"];
  const tacticsCategories = ["アンコントロール", "コントロール", "投資", "貯金", "臨時収入"];

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

  // モード切り替え時に初期カテゴリを設定
  useEffect(() => {
      if (isTacticsMode) {
          if (!tacticsCategories.includes(category)) setCategory("アンコントロール");
      } else {
          if (!normalCategories.includes(category)) setCategory("食費");
      }
  }, [isTacticsMode]);

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
    const living = Math.floor(totalMonthlyIncome * 0.5);
    const special = Math.floor(totalMonthlyIncome * 0.2);
    const invest = Math.floor(totalMonthlyIncome * 0.3);

    if (livingBudgetMode === 'daily') {
      setDailyBudget(Math.floor(living / 30));
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
        setIsTacticsMode(s.isTacticsMode || false); // New

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
        
        const prevRegularSpent = rawHistory
          .filter(item => !["特別支出", "投資", "貯金", "臨時収入", "コントロール"].includes(item.category)) // アンコントロールも生活費扱い
          .reduce((sum, item) => sum + item.amount, 0);

        let surplus = 0;
        if (currentMode === 'daily') {
            const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
            const diffDays = Math.ceil(Math.abs(now.getTime() - lastMonthDate.getTime()) / (1000 * 60 * 60 * 24));
            surplus = (diffDays * currentBudget) - prevRegularSpent;
        } else {
            surplus = currentMonthlyLiving - prevRegularSpent;
        }

        currentSavings += currentMonthlySaving;
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

      // 2. サブスク
      let dataModified = false;
      const todayDate = now.getDate();
      const updatedSubs = currentSubs.map(sub => {
        const isDue = sub.lastPaidMonth !== currentMonthKey;
        const isTime = sub.payDay === "" || todayDate >= (sub.payDay as number);
        if (isDue && isTime) {
          dataModified = true;
          const expense = sub.amount;
          if (sub.category === "特別支出" || sub.category === "コントロール") currentSavings -= expense;
          else if (sub.category === "貯金") currentInvestCash -= expense;
          rawHistory.push({ amount: expense, category: sub.category, memo: `[Sub] ${sub.name}`, date: now.toISOString(), type: 'expense' });
          return { ...sub, lastPaidMonth: currentMonthKey };
        }
        return sub;
      });

      // 3. NISA
      if (currentNisa.enabled && currentNisa.lastProcessedMonth !== currentMonthKey && todayDate >= currentNisa.day) {
        dataModified = true;
        currentInvestCash -= currentNisa.amount;
        currentInvestStock += currentNisa.amount;
        rawHistory.push({ amount: currentNisa.amount, category: "投資", memo: "[Auto] NISA積立", date: now.toISOString(), type: 'transfer' });
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

      // --- 残高計算 ---
      // const catTotals: { [key: string]: number } = {}; // 削除: 動的に生成する
      const currentCategories = isTacticsMode ? tacticsCategories : normalCategories;
      const catTotals: { [key: string]: number } = {};
      currentCategories.forEach(c => catTotals[c] = 0);

      let totalAll = 0;
      let totalRegular = 0;

      rawHistory.forEach(item => {
        if (item.type !== 'transfer') {
            totalAll += item.amount;
            
            // グラフ表示用に集計
            if (catTotals[item.category] !== undefined) {
               catTotals[item.category] += item.amount;
            } else {
               // 存在しないカテゴリの場合（モード切替時など）は無視（表示のみ）
               if(isTacticsMode && !["コントロール", "投資", "貯金", "臨時収入"].includes(item.category)) {
                   // 将来的にマッピング機能を検討
               }
            }

            // 生活費残高（Regular Spent）の計算
            // 特別費（コントロール）、投資、貯金、臨時収入 以外はすべて生活費扱い
            if (!["特別支出", "コントロール", "投資", "貯金", "臨時収入"].includes(item.category)) {
              totalRegular += item.amount;
            }
        }
      });
      setTotalSpent(totalAll);
      
      let currentBalance = 0;
      if (currentMode === 'daily') {
          let startDate = new Date(now.getFullYear(), now.getMonth(), currentPayday);
          if (now < startDate) startDate = new Date(now.getFullYear(), now.getMonth() - 1, currentPayday);
          const daysFromStart = Math.floor(Math.abs(now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          currentBalance = (daysFromStart * currentBudget) - totalRegular;
      } else {
          currentBalance = currentMonthlyLiving - totalRegular;
      }
      setBalance(currentBalance);

      setChartData({
        labels: currentCategories,
        datasets: [{
          data: currentCategories.map(c => catTotals[c]),
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

      if (category === "特別支出" || category === "コントロール") {
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
      // アンコントロール、食費などは生活費残高(balance)から引かれるが、balanceは計算結果なのでDB保存は不要

      const recordDate = new Date(inputDate);
      const now = new Date();
      recordDate.setHours(now.getHours(), now.getMinutes());

      const newHistory = [...history, { 
        amount, category, memo, date: recordDate.toISOString(), type
      }];

      await updateDoc(docRef, { history: newHistory, savings_balance: newSavings, invest_cash_balance: newInvestCash, invest_stock_balance: newInvestStock });
      
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
        dailyBudget, monthlyLivingBudget, livingBudgetMode, payday, monthlySavingTarget, monthlyInvestmentTarget, 
        isCsvMode, theme, nisaSettings, isTacticsMode, // Update
        lastAccessedMonth: `${new Date().getFullYear()}-${new Date().getMonth()}` 
      };
      
      await updateDoc(docRef, { settings: newSettings, subscriptions: subscriptions, savings_balance: tempResetValues.special, invest_cash_balance: tempResetValues.investCash, invest_stock_balance: tempResetValues.investStock });

      setIsSettingMode(false);
      loadData();
    } catch (e) { alert("更新失敗"); }
  };

  // --- 削除処理 ---
  const deleteItem = async (index: number) => {
    if (!user) return;
    if (!confirm("削除しますか？")) return;
    const item = history[index];
    let ns = savings, nic = investCash, nis = investStock;
    if (item.category === "特別支出" || item.category === "コントロール") ns += item.amount;
    else if (item.category === "貯金") nic += item.amount;
    else if (item.category === "投資") { nic += item.amount; nis -= item.amount; }
    else if (item.category === "臨時収入") nic -= item.amount;

    const newH = history.filter((_, i) => i !== index);
    await updateDoc(doc(db, "users", user.uid), { history: newH, savings_balance: ns, invest_cash_balance: nic, invest_stock_balance: nis });
    loadData();
  };

  // --- 編集モード開始 ---
  const startEdit = (index: number) => {
    const item = history[index];
    setEditIndex(index);
    setEditForm({
      amount: item.amount,
      category: item.category,
      memo: item.memo,
      date: new Date(item.date).toISOString().split('T')[0] // YYYY-MM-DD
    });
    setIsEditModalOpen(true);
  };

  // --- 編集保存処理 ---
  const handleUpdateTransaction = async () => {
    if (editIndex === null || !user) return;
    
    try {
      const docRef = doc(db, "users", user.uid);
      
      // 1. 旧データの影響を打ち消す
      const oldItem = history[editIndex];
      let ns = savings, nic = investCash, nis = investStock;
      
      if (oldItem.category === "特別支出" || oldItem.category === "コントロール") ns += oldItem.amount;
      else if (oldItem.category === "貯金") nic += oldItem.amount;
      else if (oldItem.category === "投資") { nic += oldItem.amount; nis -= oldItem.amount; }
      else if (oldItem.category === "臨時収入") nic -= oldItem.amount;

      // 2. 新データの影響を適用
      const newAmount = Number(editForm.amount);
      if (editForm.category === "特別支出" || editForm.category === "コントロール") ns -= newAmount;
      else if (editForm.category === "貯金") nic -= newAmount;
      else if (editForm.category === "投資") { nic -= newAmount; nis += newAmount; }
      else if (editForm.category === "臨時収入") nic += newAmount;

      // 3. タイプ判定
      let newType: 'expense' | 'income' | 'transfer' = 'expense';
      if (editForm.category === "投資") newType = 'transfer';
      else if (editForm.category === "臨時収入") newType = 'income';

      // 4. 配列更新
      const newHistory = [...history];
      const updateDate = new Date(editForm.date);
      const now = new Date();
      updateDate.setHours(now.getHours(), now.getMinutes());

      newHistory[editIndex] = {
        amount: newAmount,
        category: editForm.category,
        memo: editForm.memo,
        date: updateDate.toISOString(),
        type: newType
      };

      await updateDoc(docRef, { 
        history: newHistory, 
        savings_balance: ns, 
        invest_cash_balance: nic, 
        invest_stock_balance: nis 
      });

      setIsEditModalOpen(false);
      setEditIndex(null);
      loadData();

    } catch(e) { alert("更新に失敗しました"); }
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

  // --- 表示する履歴の制御 ---
  const displayHistory = showAllHistory ? history : history.slice(0, 5);
  // カテゴリリストの切り替え
  const currentCategories = isTacticsMode ? tacticsCategories : normalCategories;

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
          <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-white py-3 px-4 rounded-xl transition-all shadow-sm font-bold text-sm mb-8">
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
            Googleでログイン
          </button>
          
          {/* ログイン画面のガイド */}
          <div className="text-left border-t border-gray-100 dark:border-gray-700 pt-6 mt-6">
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-3 tracking-widest uppercase">First Time Guide</h3>
            <HelpGuide />
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 font-mono">Loading Data...</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 font-sans text-gray-800 dark:text-gray-100 pb-10">
      <div className="max-w-md md:max-w-4xl mx-auto p-4">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pt-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight dark:text-white">3つの財布</h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-widest uppercase">Hi, {user.displayName?.split(" ")[0]}</p>
              {isTacticsMode ? (
                <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">Tactics Mode</span>
              ) : (
                <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">Normal Mode</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLogout} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-full shadow-sm hover:bg-gray-50 transition-all text-xs font-bold text-gray-500">LOGOUT</button>
            {/* 使い方ガイドボタン */}
            <button onClick={() => setIsHelpModalOpen(true)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 w-8 h-8 rounded-full shadow-sm hover:bg-gray-50 transition-all flex items-center justify-center font-bold text-gray-500 text-xs">
                ?
            </button>
            <button onClick={() => setIsSettingMode(!isSettingMode)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded-full shadow-sm hover:bg-gray-50 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-300"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        {/* 使い方ガイドモーダル */}
        {isHelpModalOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700 max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                           <span className="text-lg">📖</span> 使い方ガイド
                        </h3>
                        <button onClick={() => setIsHelpModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <HelpGuide />
                </div>
            </div>
        )}

        {/* Tactics Modeガイドモーダル (変更: tacticsGuideType !== null で表示) */}
        {tacticsGuideType !== null && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700 max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                           <span className="text-lg">⚔️</span> Tactics Mode 定義
                        </h3>
                        {/* 閉じるボタン: setTacticsGuideType(null) */}
                        <button onClick={() => setTacticsGuideType(null)} className="text-gray-400 hover:text-gray-600">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    {/* typeを渡して表示内容を切り替え */}
                    <TacticsGuide type={tacticsGuideType} />
                </div>
            </div>
        )}

        {/* 編集モーダル */}
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700">
               <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                 履歴の編集
               </h3>
               <div className="space-y-3">
                 <div>
                   <label className="text-[10px] text-gray-400 block mb-1">金額</label>
                   <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
                     value={editForm.amount} onChange={(e)=>setEditForm({...editForm, amount: Number(e.target.value)})} />
                 </div>
                 <div>
                   <label className="text-[10px] text-gray-400 block mb-1">日付</label>
                   <input type="date" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
                     value={editForm.date} onChange={(e)=>setEditForm({...editForm, date: e.target.value})} />
                 </div>
                 <div>
                   <label className="text-[10px] text-gray-400 block mb-1">カテゴリ</label>
                   <select className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs"
                     value={editForm.category} onChange={(e)=>setEditForm({...editForm, category: e.target.value})}>
                     {currentCategories.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="text-[10px] text-gray-400 block mb-1">メモ</label>
                   <input type="text" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs"
                     value={editForm.memo} onChange={(e)=>setEditForm({...editForm, memo: e.target.value})} />
                 </div>
                 <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={()=>setIsEditModalOpen(false)} className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg">キャンセル</button>
                    <button onClick={handleUpdateTransaction} className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg shadow-lg">保存する</button>
                 </div>
               </div>
            </div>
          </div>
        )}

        {isSettingMode ? (
          // --- 設定画面 ---
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden animation-fade-in max-w-md mx-auto">
             <div className="bg-blue-600 p-4 text-center">
               <h2 className="text-white font-bold text-sm tracking-widest uppercase">Settings</h2>
             </div>
             <div className="p-6 space-y-8 max-h-[75vh] overflow-y-auto">
               
               {/* 0. Tactics Mode切替 */}
               <section>
                 <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">モード設定</h3>
                 <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl mb-2">
                   <div>
                     <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300 block">Tactics Mode</span>
                     <span className="text-[9px] text-gray-400 block">資金の性質（義務・裁量）で管理</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <input type="checkbox" checked={isTacticsMode} onChange={(e)=>setIsTacticsMode(e.target.checked)} className="toggle" />
                   </div>
                 </div>
                 {isTacticsMode && (
                   // 変更: 設定画面からは'all'で両方表示
                   <button onClick={() => setTacticsGuideType('all')} className="w-full text-center text-[10px] text-blue-500 underline py-1">
                     【定義を確認】義務・裁量の分類例
                   </button>
                 )}
               </section>

               <section>
                 <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-3 border-b border-blue-100 dark:border-blue-900 pb-1">基本予算設定</h3>
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl mb-4">
                    <label className="text-[10px] text-blue-500 font-bold block mb-1">1ヶ月の総収入から自動振り分け (5:2:3)</label>
                    <div className="flex gap-2">
                        <input type="number" placeholder="例: 300000" className="flex-1 p-2 bg-white dark:bg-gray-700 rounded text-sm" value={totalMonthlyIncome} onChange={(e)=>setTotalMonthlyIncome(Number(e.target.value))} />
                        <button onClick={calculateBudgetDistribution} className="bg-blue-600 text-white text-xs font-bold px-3 rounded shadow-sm">反映</button>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="col-span-2 flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                       <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300">生活費予算モード</span>
                       <div className="flex gap-1">
                           <button onClick={()=>setLivingBudgetMode('daily')} className={`px-2 py-1 text-[10px] rounded ${livingBudgetMode==='daily' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>日割(積上)</button>
                           <button onClick={()=>setLivingBudgetMode('monthly')} className={`px-2 py-1 text-[10px] rounded ${livingBudgetMode==='monthly' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>月額(減算)</button>
                       </div>
                   </div>
                   {livingBudgetMode === 'daily' ? (
                       <div><label className="text-[10px] text-gray-400 block mb-1">1日の生活費予算</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={dailyBudget} onChange={(e)=>setDailyBudget(Number(e.target.value))} /></div>
                   ) : (
                       <div><label className="text-[10px] text-gray-400 block mb-1">1ヶ月の生活費予算</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlyLivingBudget} onChange={(e)=>setMonthlyLivingBudget(Number(e.target.value))} /></div>
                   )}
                   <div><label className="text-[10px] text-gray-400 block mb-1">給料日</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={payday} onChange={(e)=>setPayday(Number(e.target.value))} /></div>
                   <div><label className="text-[10px] text-gray-400 block mb-1">特別費積立(月)</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlySavingTarget} onChange={(e)=>setMonthlySavingTarget(Number(e.target.value))} /></div>
                   <div><label className="text-[10px] text-gray-400 block mb-1">貯金・投資積立(月)</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlyInvestmentTarget} onChange={(e)=>setMonthlyInvestmentTarget(Number(e.target.value))} /></div>
                 </div>
               </section>
               <section>
                 <h3 className="text-xs font-bold text-red-500 uppercase mb-3 border-b border-red-100 dark:border-red-900 pb-1">残高修正 (リセット)</h3>
                 <div className="space-y-3">
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">特別費 残高</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.special} onChange={(e)=>setTempResetValues({...tempResetValues, special: Number(e.target.value)})} /></div>
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">貯金(現金) 残高</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.investCash} onChange={(e)=>setTempResetValues({...tempResetValues, investCash: Number(e.target.value)})} /></div>
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">投資(資産) 残高</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.investStock} onChange={(e)=>setTempResetValues({...tempResetValues, investStock: Number(e.target.value)})} /></div>
                 </div>
               </section>
               <section>
                  <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-3 border-b border-indigo-100 dark:border-indigo-900 pb-1">自動積立・固定費</h3>
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl mb-4">
                    <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">NISA自動積立</span><input type="checkbox" checked={nisaSettings.enabled} onChange={(e)=>setNisaSettings({...nisaSettings, enabled: e.target.checked})} className="toggle" /></div>
                    {nisaSettings.enabled && (<div className="flex gap-2"><input type="number" placeholder="金額" className="flex-1 p-2 rounded text-xs" value={nisaSettings.amount} onChange={(e)=>setNisaSettings({...nisaSettings, amount: Number(e.target.value)})} /><input type="number" placeholder="日" className="w-16 p-2 rounded text-xs" value={nisaSettings.day} onChange={(e)=>setNisaSettings({...nisaSettings, day: Number(e.target.value)})} /></div>)}
                  </div>
                  <div className="mb-2">
                      <div className="flex justify-between items-center mb-2"><label className="text-[10px] text-gray-400 font-bold uppercase">サブスクリプション</label><button onClick={()=>{const n = prompt("名称"); if(!n)return;const a = prompt("金額"); if(!a)return;const d = prompt("支払日"); const c = prompt("カテゴリ", "その他");setSubscriptions([...subscriptions, {id: Date.now(), name: n, amount: Number(a), payDay: d?Number(d):"", category:c||"その他", lastPaidMonth:""}]);}} className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded font-bold">追加</button></div>
                      <div className="space-y-1">{subscriptions.map(s => (<div key={s.id} className="flex justify-between text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>{s.name} (¥{s.amount})</span><button onClick={()=>setSubscriptions(subscriptions.filter(i=>i.id!==s.id))} className="text-red-400">削除</button></div>))}</div>
                  </div>
               </section>
               <section>
                   <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">表示設定</h3>
                   <div className="flex gap-2 mb-4">{(['light', 'dark', 'system'] as ThemeOption[]).map(t => (<button key={t} onClick={()=>setTheme(t)} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme===t ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>{t === 'light' ? 'ライト' : t === 'dark' ? 'ダーク' : '自動'}</button>))}</div>
                   <div className="flex items-center justify-between"><span className="text-xs text-gray-500">CSV出力機能</span><input type="checkbox" checked={isCsvMode} onChange={(e)=>setIsCsvMode(e.target.checked)} /></div>
                   {isCsvMode && <button onClick={downloadCSV} className="mt-2 text-xs text-green-600 underline">過去データのダウンロード</button>}
               </section>
               
               <button onClick={handleUpdateSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold text-sm shadow-lg transition-transform active:scale-95">設定を保存して戻る</button>
             </div>
          </div>
        ) : (
          // --- メイン画面 ---
          <div className="space-y-6 animate-fade-in-up">
            
            {/* 1. ダッシュボード (PCでは横並び) */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-blue-50 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10 flex justify-between items-start">
                     <p className="text-[10px] font-bold text-blue-400 dark:text-blue-300 mb-1 uppercase tracking-wider">
                       {isTacticsMode ? "🛡️【義務】アンコントロール" : "生活費残高"}
                     </p>
                     {isTacticsMode && (
                        // 変更: 'uncontrol' のみ表示
                        <button onClick={() => setTacticsGuideType('uncontrol')} className="text-blue-400 hover:text-blue-600 -mt-1 -mr-1 p-1">
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </button>
                     )}
                  </div>
                  <p className={`text-2xl font-mono font-bold relative z-10 ${balance < 0 ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>¥{balance.toLocaleString()}</p>
                  <p className="text-[8px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                    {isTacticsMode ? "Uncontrollable Expenses" : (livingBudgetMode === 'daily' ? 'Daily Accumulation' : 'Monthly Budget')}
                  </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-pink-50 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-pink-50 dark:bg-pink-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10 flex justify-between items-start">
                     <p className="text-[10px] font-bold text-pink-400 dark:text-pink-300 mb-1 uppercase tracking-wider">
                       {isTacticsMode ? "🎮【裁量】コントロール" : "特別費"}
                     </p>
                     {isTacticsMode && (
                        // 変更: 'control' のみ表示
                        <button onClick={() => setTacticsGuideType('control')} className="text-pink-400 hover:text-pink-600 -mt-1 -mr-1 p-1">
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </button>
                     )}
                  </div>
                  <p className="text-2xl font-mono font-bold text-gray-800 dark:text-white relative z-10">¥{savings.toLocaleString()}</p>
                  {isTacticsMode && <p className="text-[8px] text-gray-400 dark:text-gray-500 mt-1 font-mono">Controllable Expenses</p>}
              </div>

              <div className="col-span-2 md:col-span-1 bg-gradient-to-r from-indigo-600 to-violet-600 p-5 rounded-3xl shadow-lg text-white relative overflow-hidden">
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
            </div>

            {/* 2カラムレイアウト (PC画面用) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 左カラム: 入力 + 履歴 */}
                <div className="space-y-6">
                    {/* 入力エリア */}
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                      <div className="flex flex-wrap gap-2 mb-4 justify-center">
                        {currentCategories.map(cat => (
                          <button key={cat} onClick={() => setCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              category === cat 
                                ? (['投資','貯金','臨時収入'].includes(cat) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' : (cat === '特別支出' || cat === 'コントロール') ? 'bg-pink-500 text-white shadow-md shadow-pink-200 dark:shadow-none' : 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none') 
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
                             <button onClick={handlePayment} className={`h-full text-white rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all uppercase tracking-widest ${['投資','貯金','臨時収入'].includes(category) ? 'bg-indigo-600' : (category === '特別支出' || category === 'コントロール') ? 'bg-pink-500' : 'bg-blue-600'}`}>
                               決定
                             </button>
                          </div>
                        </div>
                        <input type="text" placeholder="メモを入力..."
                          className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs outline-none focus:bg-white dark:focus:bg-gray-700 transition-colors dark:text-white"
                          value={memo} onChange={(e) => setMemo(e.target.value)} />
                      </div>
                    </div>

                    {/* 履歴リスト */}
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                      <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-4 uppercase tracking-widest">直近の履歴</h3>
                      <div className="space-y-4">
                        {displayHistory.map((item, index) => {
                          return (
                            <div key={index} className="flex items-start justify-between border-b border-gray-50 dark:border-gray-700 pb-3 last:border-0">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${['投資','貯金','臨時収入'].includes(item.category) ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' : (item.category === '特別支出' || item.category === 'コントロール') ? 'bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>{item.category}</span>
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
                              <div className="flex gap-2">
                                  <button onClick={() => startEdit(index)} className="text-gray-300 hover:text-blue-500 transition-colors p-2">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </button>
                                  <button onClick={() => deleteItem(index)} className="text-gray-300 hover:text-red-400 transition-colors p-2">
                                      <span className="text-[10px] font-bold">×</span>
                                  </button>
                              </div>
                            </div>
                          );
                        })}
                        {history.length === 0 && <p className="text-center text-xs text-gray-300 py-4">履歴はありません</p>}
                      </div>
                      
                      {/* Read More ボタン */}
                      {history.length > 5 && (
                        <button 
                          onClick={() => setShowAllHistory(!showAllHistory)}
                          className="w-full mt-4 py-2 text-xs font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition-colors border border-dashed border-blue-200 dark:border-gray-600"
                        >
                          {showAllHistory ? "Close" : "Read More..."}
                        </button>
                      )}
                    </div>
                </div>

                {/* 右カラム: グラフ (PCでは常時表示) */}
                <div>
                    {chartData && totalSpent > 0 && (
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col justify-center">
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
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}