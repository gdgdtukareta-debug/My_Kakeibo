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
  isSplit?: boolean;
  investAmount?: number;
  poolAmount?: number;
};

type Subscription = {
  id: number;
  name: string;
  amount: number;
  payDay: number | ""; 
  category: string;
  lastPaidMonth: string; 
};

type TargetItem = {
  name: string;
  targetAmount: number;
  currentAmount: number;
};

type MonthlyBalanceRecord = {
  month: string;
  uncontrol: number;
  control: number;
};

type AppMode = 'simple' | 'technical';
type ThemeOption = 'light' | 'dark' | 'system';
type BudgetMode = 'daily' | 'monthly';
type SurplusAction = 'save' | 'target';

type Archives = { [key: string]: Transaction[] };

// --- 休日・祝日判定と給料日計算ロジック ---
// APIから取得した祝日データを保持する変数
let fetchedHolidays: string[] = [];

// APIエラー時のフォールバック用（2024〜2026年）
const fallbackHolidays = [
  "2024-01-01", "2024-01-08", "2024-02-12", "2024-02-23", "2024-03-20", "2024-04-29", "2024-05-03", "2024-05-04", "2024-05-06", "2024-07-15", "2024-08-12", "2024-09-16", "2024-09-22", "2024-09-23", "2024-10-14", "2024-11-03", "2024-11-04", "2024-11-23",
  "2025-01-01", "2025-01-13", "2025-02-11", "2025-02-23", "2025-02-24", "2025-03-20", "2025-04-29", "2025-05-03", "2025-05-04", "2025-05-05", "2025-05-06", "2025-07-21", "2025-08-11", "2025-09-15", "2025-09-23", "2025-10-13", "2025-11-03", "2025-11-23", "2025-11-24",
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23"
];

// 初期化時に非同期で日本の祝日カレンダーAPIを取得
if (typeof window !== "undefined") {
    fetch("https://holidays-jp.github.io/api/v1/date.json")
        .then(res => res.json())
        .then(data => {
            fetchedHolidays = Object.keys(data);
        })
        .catch(() => console.error("祝日データの取得に失敗しました。フォールバックを使用します。"));
}

const isHolidayOrWeekend = (d: Date) => {
  const day = d.getDay();
  if (day === 0 || day === 6) return true; // 日・土
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const holidaysList = fetchedHolidays.length > 0 ? fetchedHolidays : fallbackHolidays;
  return holidaysList.includes(dateStr);
};

const getActualPayday = (year: number, month: number, paydaySetting: number) => {
  let date = new Date(year, month, paydaySetting);
  if (date.getMonth() !== month) {
      date = new Date(year, month + 1, 0);
  }
  while (isHolidayOrWeekend(date)) {
      date.setDate(date.getDate() - 1);
  }
  return date;
};

// --- Tactics Mode 定義コンテンツ ---
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
      <p><span className="font-bold text-blue-500">医療費・薬代</span>：急な体調不良はタイミングを選べません。定期の通院も健康維持のためには欠かせません。</p>
      <p><span className="font-bold text-blue-500">会費</span>：組織に属する以上、強制徴収です。</p>
      <p><span className="font-bold text-blue-500">冠婚葬祭</span>：避けることができません。</p>
      <p><span className="font-bold text-blue-500">サブスク・QOL維持</span>：自動引き落としなど。</p>
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
      <p><span className="font-bold text-pink-500">ジュース</span>：「今月買うか、来月まで我慢して水道水にするか」は選べます。</p>
      <p><span className="font-bold text-pink-500">家族や友人との外食</span>：「行く・行かない」を選べます。</p>
      <p><span className="font-bold text-pink-500">趣味のもの</span>：完全に自分の意思です。</p>
      <p><span className="font-bold text-pink-500">自分だけのおやつ</span>：我慢すれば0円にできます。</p>
    </div>
  </div>
);

const DefenseFundContent = () => (
  <div className="border-l-4 border-indigo-500 pl-3">
    <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-1 text-sm flex items-center gap-2">
      <span>🏰</span> 3. 生活防衛資金
      <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded ml-auto">現金貯金</span>
    </h4>
    <p className="font-bold text-gray-800 dark:text-gray-200 mb-1">
      「何かあっても生きていける心の安全装置」
    </p>
    <p className="mb-2 opacity-80">
      病気やケガで働けなくなった時や、急な大型出費に備えるための現金です。
      <br/>
      <span className="text-[10px] opacity-70">※基準額 = (アンコントロール予算 + コントロール予算) / 月</span>
    </p>
    <div className="bg-white dark:bg-gray-700/50 p-3 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">🛡️</span>
        <div>
           <p className="font-bold text-indigo-500 text-xs">Lv.1 安心ライン (3ヶ月分)</p>
           <p className="text-[10px] text-gray-500 dark:text-gray-400">一時的な休職や転職活動でも焦らずにいられる最低ライン。</p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-gray-100 dark:border-gray-600 pt-2">
        <span className="text-lg">🏰</span>
        <div>
           <p className="font-bold text-indigo-500 text-xs">Lv.2 盤石ライン (6ヶ月分)</p>
           <p className="text-[10px] text-gray-500 dark:text-gray-400">長期療養や災害時でも生活水準を落とさず耐えられる鉄壁の守り。</p>
        </div>
      </div>
    </div>
  </div>
);

const TacticsGuide = ({ type }: { type: 'uncontrol' | 'control' | 'defense' | 'all' }) => (
  <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 leading-relaxed space-y-6">
    {(type === 'all' || type === 'uncontrol') && <UncontrolContent />}
    {(type === 'all' || type === 'control') && <ControlContent />}
    {(type === 'all' || type === 'defense') && <DefenseFundContent />}
  </div>
);

const HelpGuide = () => (
  <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 leading-relaxed space-y-6">
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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [appMode, setAppMode] = useState<AppMode>('simple');
  const [totalMonthlyIncome, setTotalMonthlyIncome] = useState(0);
  const [livingBudgetMode, setLivingBudgetMode] = useState<BudgetMode>('daily');
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [monthlyLivingBudget, setMonthlyLivingBudget] = useState(30000);
  
  const [payday, setPayday] = useState(25);
  const [monthlySavingTarget, setMonthlySavingTarget] = useState(0); 
  const [monthlyInvestmentTarget, setMonthlyInvestmentTarget] = useState(0); 
  const [lastProcessedPaydayState, setLastProcessedPaydayState] = useState("");

  const [surplusAction, setSurplusAction] = useState<SurplusAction>('save');
  const [targetItem, setTargetItem] = useState<TargetItem | null>(null);
  const [tempIncomeInvestRatio, setTempIncomeInvestRatio] = useState(50); 
  
  const [balance, setBalance] = useState(0);            
  const [savings, setSavings] = useState(0);            
  const [investCash, setInvestCash] = useState(0);      
  const [investStock, setInvestStock] = useState(0);    
  const [totalSpent, setTotalSpent] = useState(0);

  const [nisaSettings, setNisaSettings] = useState({ enabled: false, amount: 0, day: 1, lastProcessedMonth: "" });
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [monthlyBalances, setMonthlyBalances] = useState<MonthlyBalanceRecord[]>([]);
  
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
  const [isTacticsMode, setIsTacticsMode] = useState(false); 
  const [isUnlimitedArchive, setIsUnlimitedArchive] = useState(false); 
  const [secretCode, setSecretCode] = useState(""); 
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ amount: 0, category: "", memo: "", date: "" });
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false); 
  const [tacticsGuideType, setTacticsGuideType] = useState<'uncontrol' | 'control' | 'defense' | 'all' | null>(null);
  
  const [isRecoverModalOpen, setIsRecoverModalOpen] = useState(false);
  const [recoverAmount, setRecoverAmount] = useState("");
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const [theme, setTheme] = useState<ThemeOption>('system');
  const [tempResetValues, setTempResetValues] = useState({ special: 0, investCash: 0, investStock: 0, living: 0 });

  const normalCategories = ["食費", "日用品", "趣味", "仕事", "その他", "特別支出", "投資", "貯金", "臨時収入", "投資回収", "積立取崩", "プール金利用"];
  const tacticsCategories = ["アンコントロール", "コントロール", "投資", "貯金", "臨時収入", "投資回収", "積立取崩", "プール金利用"];

  const categoryColors: Record<string, string> = {
      "食費": "#f97316", "日用品": "#06b6d4", "趣味": "#ec4899", "仕事": "#64748b", "その他": "#94a3b8", "特別支出": "#ef4444", 
      "アンコントロール": "#3b82f6", "コントロール": "#ec4899", "投資": "#8b5cf6", "貯金": "#10b981", "臨時収入": "#fbbf24", 
      "投資回収": "#6366f1", "積立取崩": "#a5b4fc", "プール金利用": "#f43f5e"
  };
  const getCategoryColor = (cat: string) => categoryColors[cat] || "#cbd5e1";

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

  useEffect(() => {
      if (isTacticsMode) {
          if (!tacticsCategories.includes(category)) setCategory("アンコントロール");
      } else {
          if (!normalCategories.includes(category)) setCategory("食費");
      }
  }, [isTacticsMode]);

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
      setMonthlyBalances([]);
    } catch (error) { console.error(error); }
  };

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

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      
      let currentAppMode: AppMode = 'simple';
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
      let currentLastProcessedPayday = "";

      let currentSurplusAction: SurplusAction = 'save';
      let currentTargetItem: TargetItem | null = null;
      let currentTempRatio = 50;
      let currentUnlimitedArchive = false;

      let currentMonthlyBalances: MonthlyBalanceRecord[] = [];
      let isTacticsModeNow = false;

      if (docSnap.exists()) {
        const data = docSnap.data();
        const s = data.settings || {};
        
        currentAppMode = s.appMode || 'simple';
        currentBudget = s.dailyBudget || 1000;
        currentMonthlyLiving = s.monthlyLivingBudget || 30000;
        currentMode = s.livingBudgetMode || 'daily';
        
        currentPayday = s.payday || 25;
        currentMonthlySaving = s.monthlySavingTarget || 0;
        currentMonthlyInvestment = s.monthlyInvestmentTarget || 0;
        currentLastProcessedPayday = s.lastProcessedPayday || "";
        setTheme(s.theme || 'system');
        setIsCsvMode(s.isCsvMode || false);
        currentNisa = s.nisaSettings || currentNisa;
        isTacticsModeNow = currentAppMode === 'simple' ? false : (s.isTacticsMode || false);
        setIsTacticsMode(isTacticsModeNow); 
        currentUnlimitedArchive = s.isUnlimitedArchive || false;

        currentSurplusAction = s.surplusAction || 'save';
        currentTargetItem = s.targetItem || null;
        currentTempRatio = s.tempIncomeInvestRatio !== undefined ? s.tempIncomeInvestRatio : 50;
        
        setAppMode(currentAppMode);
        setDailyBudget(currentBudget);
        setMonthlyLivingBudget(currentMonthlyLiving);
        setLivingBudgetMode(currentMode);
        
        setPayday(currentPayday);
        setMonthlySavingTarget(currentMonthlySaving);
        setMonthlyInvestmentTarget(currentMonthlyInvestment);
        setNisaSettings(currentNisa);
        setSurplusAction(currentSurplusAction);
        setTargetItem(currentTargetItem);
        setTempIncomeInvestRatio(currentTempRatio);
        setIsUnlimitedArchive(currentUnlimitedArchive);

        currentSavings = data.savings_balance || 0;
        currentInvestCash = data.invest_cash_balance ?? (data.investment_balance || 0);
        currentInvestStock = data.invest_stock_balance || 0;
        
        rawHistory = data.history || [];
        currentArchives = data.archives || {};
        currentSubs = data.subscriptions || [];
        currentMonthlyBalances = data.monthlyBalances || [];

        if (currentUnlimitedArchive) {
           const dataSize = new Blob([JSON.stringify(data)]).size;
           const warningThreshold = 950 * 1024; 
           if (dataSize > warningThreshold) {
               alert(`⚠️【データ容量警告】\n保存データが上限(1MB)に近づいています。(現在約${Math.round(dataSize/1024)}KB)\n古い履歴やアーカイブを手動で削除してください。`);
           }
        }
      } else {
        await setDoc(docRef, { savings_balance: 0, invest_cash_balance: 0, invest_stock_balance: 0, history: [], settings: {}, archives: [], subscriptions: [], monthlyBalances: [] });
      }

      const now = new Date();
      const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;

      // --- 給料日判定の計算 ---
      let targetPayday = getActualPayday(now.getFullYear(), now.getMonth(), currentPayday);
      if (todayZero.getTime() < targetPayday.getTime()) {
          targetPayday = getActualPayday(now.getFullYear(), now.getMonth() - 1, currentPayday);
      }
      const targetPaydayStr = `${targetPayday.getFullYear()}-${String(targetPayday.getMonth() + 1).padStart(2, '0')}-${String(targetPayday.getDate()).padStart(2, '0')}`;

      let dataModified = false;

      // 1. 給料日ベースの処理
      if (currentLastProcessedPayday !== targetPaydayStr && currentLastProcessedPayday !== "") {
        
        const prevPayday = getActualPayday(targetPayday.getFullYear(), targetPayday.getMonth() - 1, currentPayday);

        const oldHistoryToArchive: Transaction[] = [];
        const keptHistory: Transaction[] = [];
        let prevRegularSpent = 0;

        rawHistory.forEach(item => {
            const itemDate = new Date(item.date);
            if (itemDate < targetPayday) {
                oldHistoryToArchive.push(item);
                if (itemDate >= prevPayday && !["特別支出", "コントロール", "投資", "貯金", "臨時収入", "投資回収", "積立取崩", "プール金利用"].includes(item.category)) {
                    // 以前の履歴の精算
                    if (item.type === 'income') {
                        prevRegularSpent -= item.amount;
                    } else {
                        prevRegularSpent += item.amount;
                    }
                }
            } else {
                keptHistory.push(item);
            }
        });

        let surplus = 0;
        if (currentMode === 'daily') {
            const diffDays = Math.ceil((targetPayday.getTime() - prevPayday.getTime()) / (1000 * 60 * 60 * 24));
            surplus = (diffDays * currentBudget) - prevRegularSpent;
        } else {
            surplus = currentMonthlyLiving - prevRegularSpent;
        }

        // 月次残高の記録（無制限モード時）
        if (currentUnlimitedArchive) {
            const prevPaydayStr = `${prevPayday.getFullYear()}/${String(prevPayday.getMonth() + 1).padStart(2, '0')}/${String(prevPayday.getDate()).padStart(2, '0')}`;
            currentMonthlyBalances.push({
                month: prevPaydayStr,
                uncontrol: surplus, // 月末着地時点の生活費残高
                control: currentSavings // 月末着地時点の特別費残高
            });
        }

        currentSavings += currentMonthlySaving;
        currentInvestCash += currentMonthlyInvestment;

        if (surplus > 0) {
           if (currentAppMode === 'technical' && currentSurplusAction === 'target' && currentTargetItem) {
               currentTargetItem.currentAmount += surplus;
           } else {
               currentInvestCash += surplus;
           }
        } else if (surplus < 0) {
           // マイナス分（前借り）を清算するため、新しい月の履歴にマイナス繰越を追加
           keptHistory.push({
               amount: Math.abs(surplus),
               category: (isTacticsModeNow && currentAppMode === 'technical') ? "アンコントロール" : "その他",
               memo: "前月からの予算オーバー分(前借り清算)",
               date: targetPayday.toISOString(),
               type: 'expense'
           });
        }

        if (oldHistoryToArchive.length > 0) {
            currentArchives[targetPaydayStr] = oldHistoryToArchive;
        }
        
        const sortedKeys = Object.keys(currentArchives).sort();
        if (!currentUnlimitedArchive && sortedKeys.length > 6) {
          const newArchives: Archives = {};
          sortedKeys.slice(-6).forEach(key => newArchives[key] = currentArchives[key]);
          currentArchives = newArchives;
        }

        rawHistory = keptHistory;
        currentLastProcessedPayday = targetPaydayStr;
        dataModified = true;
      } else if (currentLastProcessedPayday === "") {
        currentLastProcessedPayday = targetPaydayStr;
        dataModified = true;
      }

      // 2. サブスク (月次処理)
      const todayDate = now.getDate();
      let updatedSubs = currentSubs;
      if (currentAppMode === 'technical') {
          updatedSubs = currentSubs.map(sub => {
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
      }

      // 3. NISA (月次処理)
      if (currentAppMode === 'technical' && currentNisa.enabled && currentNisa.lastProcessedMonth !== currentMonthKey && todayDate >= currentNisa.day) {
        dataModified = true;
        currentInvestCash -= currentNisa.amount;
        currentInvestStock += currentNisa.amount;
        rawHistory.push({ amount: currentNisa.amount, category: "投資", memo: "[Auto] NISA積立", date: now.toISOString(), type: 'transfer' });
        currentNisa.lastProcessedMonth = currentMonthKey;
        setNisaSettings(currentNisa);
      }

      if (dataModified) {
        await updateDoc(docRef, {
          savings_balance: currentSavings,
          invest_cash_balance: currentInvestCash,
          invest_stock_balance: currentInvestStock,
          history: rawHistory,
          archives: currentArchives,
          subscriptions: updatedSubs,
          monthlyBalances: currentMonthlyBalances,
          "settings.lastProcessedPayday": currentLastProcessedPayday,
          "settings.nisaSettings": currentNisa,
          "settings.targetItem": currentTargetItem
        });
      }

      setSavings(currentSavings);
      setInvestCash(currentInvestCash);
      setInvestStock(currentInvestStock);
      setSubscriptions(updatedSubs);
      setArchives(currentArchives);
      setTargetItem(currentTargetItem);
      setMonthlyBalances(currentMonthlyBalances);
      setLastProcessedPaydayState(currentLastProcessedPayday);

      const sortedHistory = [...rawHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sortedHistory);

      // --- 残高計算 ---
      const currentCategories = (isTacticsModeNow && appMode === 'technical') ? tacticsCategories : normalCategories;
      const catTotals: { [key: string]: number } = {};
      currentCategories.forEach(c => catTotals[c] = 0);

      let totalAll = 0;
      let totalRegular = 0;

      rawHistory.forEach(item => {
        if (item.type !== 'transfer') {
            totalAll += item.amount;
            if (catTotals[item.category] !== undefined) catTotals[item.category] += item.amount;
            if (item.category === "投資回収" || item.category === "積立取崩") totalAll -= item.amount;
            
            // 生活費残高の計算ロジック（収入対応）
            if (!["特別支出", "コントロール", "投資", "貯金", "臨時収入", "投資回収", "積立取崩", "プール金利用"].includes(item.category)) {
              if (item.type === 'income') {
                  totalRegular -= item.amount;
              } else {
                  totalRegular += item.amount;
              }
            }
        }
      });
      setTotalSpent(totalAll);
      
      let currentBalance = 0;
      if (currentMode === 'daily') {
          const daysFromStart = Math.floor((now.getTime() - targetPayday.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          currentBalance = (daysFromStart * currentBudget) - totalRegular;
      } else {
          currentBalance = currentMonthlyLiving - totalRegular;
      }
      setBalance(currentBalance);
      
      // リセット用の一時変数に最新の残高をセット
      setTempResetValues({ special: currentSavings, investCash: currentInvestCash, investStock: currentInvestStock, living: currentBalance });

      setChartData({
        labels: currentCategories,
        datasets: [{
          data: currentCategories.map(c => catTotals[c]),
          backgroundColor: currentCategories.map(c => getCategoryColor(c)),
          borderWidth: 0,
        }]
      });

    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (user) { loadData(); }
  }, [user]);

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
      
      let newTargetItem = targetItem ? { ...targetItem } : null;
      let isSplit = false;
      let investAmt = amount;
      let poolAmt = 0;

      if (category === "特別支出" || category === "コントロール") {
        newSavings -= amount;
      } else if (category === "プール金利用") {
        if (newTargetItem) {
            newTargetItem.currentAmount = Math.max(0, newTargetItem.currentAmount - amount);
        }
      } else if (category === "貯金") {
        newInvestCash -= amount;
      } else if (category === "投資") {
        newInvestCash -= amount;
        newInvestStock += amount;
        type = 'transfer';
      } else if (category === "臨時収入") {
        if (appMode === 'technical' && newTargetItem && surplusAction === 'target') {
            investAmt = Math.floor(amount * (tempIncomeInvestRatio / 100));
            poolAmt = amount - investAmt;
            isSplit = true;
            newInvestCash += investAmt;
            newTargetItem.currentAmount += poolAmt;
        } else {
            newInvestCash += amount;
        }
        type = 'income';
      }
      else if (category === "投資回収") {
          newInvestCash += amount;
          newInvestStock -= amount;
          type = 'income';
      } else if (category === "積立取崩") {
          newSavings += amount;
          type = 'income';
      }

      const recordDate = new Date(inputDate);
      const now = new Date();
      recordDate.setHours(now.getHours(), now.getMinutes());

      const newHistoryItem: Transaction = { 
        amount, category, memo, date: recordDate.toISOString(), type 
      };
      
      if (isSplit) {
          newHistoryItem.isSplit = true;
          newHistoryItem.investAmount = investAmt;
          newHistoryItem.poolAmount = poolAmt;
          newHistoryItem.memo = memo ? `${memo} (按分済)` : '(投資/プール按分済)';
      }

      const newHistory = [...history, newHistoryItem];

      const updatePayload: any = { 
          history: newHistory, 
          savings_balance: newSavings, 
          invest_cash_balance: newInvestCash, 
          invest_stock_balance: newInvestStock 
      };

      if ((isSplit || category === "プール金利用") && newTargetItem) {
          updatePayload["settings.targetItem"] = newTargetItem;
          setTargetItem(newTargetItem);
      }

      await updateDoc(docRef, updatePayload);
      
      setExpense("");
      setMemo("");
      loadData();
    } catch (e) { alert("保存に失敗しました"); }
  };

  const handleRecover = async () => {
      if (!user) return;
      const amount = Number(recoverAmount);
      if (!amount || amount <= 0) {
          alert("有効な金額を入力してください");
          return;
      }
      if (amount > investStock) {
          alert("資産残高を超えています");
          return;
      }

      try {
          const docRef = doc(db, "users", user.uid);
          const newInvestStock = investStock - amount;
          const newInvestCash = investCash + amount;
          const now = new Date();
          
          const newHistory = [...history, {
              amount: amount,
              category: "投資回収",
              memo: "資産から現金へ回収",
              date: now.toISOString(),
              type: 'income' as const
          }];

          await updateDoc(docRef, {
              invest_stock_balance: newInvestStock,
              invest_cash_balance: newInvestCash,
              history: newHistory
          });

          setIsRecoverModalOpen(false);
          setRecoverAmount("");
          loadData();
      } catch (e) {
          alert("回収処理に失敗しました");
      }
  };
  
  const handlePurchaseTarget = async () => {
      if (!user || !targetItem) return;
      
      const confirmPurchase = confirm(`「${targetItem.name}」を取り崩しますか？\nプール金残高(${targetItem.currentAmount.toLocaleString()}円)を使用して支出を記録し、残高を0にリセットします。\n※特別費(コントロール)には影響しません。`);
      if (!confirmPurchase) return;

      try {
          const docRef = doc(db, "users", user.uid);
          const now = new Date();
          const purchaseAmount = targetItem.currentAmount; 
          
          const withdrawRecord: Transaction = {
              amount: purchaseAmount,
              category: "プール金利用",
              memo: `プール金より: ${targetItem.name}`,
              date: now.toISOString(),
              type: 'expense'
          };
          
          const newHistory = [...history, withdrawRecord];
          
          const newSettings = {
              ...((await getDoc(docRef)).data()?.settings || {}),
              targetItem: { ...targetItem, currentAmount: 0 } 
          };

          await updateDoc(docRef, {
              history: newHistory,
              settings: newSettings
          });

          setTargetItem({ ...targetItem, currentAmount: 0 });
          loadData();
          alert(`「${targetItem.name}」の取り崩しを記録しました。`);

      } catch(e) {
          alert("購入処理に失敗しました");
      }
  };

  const handlePartialWithdraw = async () => {
      if (!user || !targetItem) return;
      const amount = Number(withdrawAmount);
      
      if (!amount || amount <= 0) {
          alert("有効な金額を入力してください");
          return;
      }
      if (amount > targetItem.currentAmount) {
          alert("現在の積立額を超えています");
          return;
      }

      try {
          const docRef = doc(db, "users", user.uid);
          const now = new Date();
          
          const withdrawRecord: Transaction = {
              amount: amount,
              category: "プール金利用",
              memo: `プール金一部利用: ${targetItem.name}`,
              date: now.toISOString(),
              type: 'expense'
          };
          
          const newHistory = [...history, withdrawRecord];
          const newCurrentAmount = targetItem.currentAmount - amount;
          
          const newSettings = {
              ...((await getDoc(docRef)).data()?.settings || {}),
              targetItem: { ...targetItem, currentAmount: newCurrentAmount }
          };

          await updateDoc(docRef, {
              history: newHistory,
              settings: newSettings
          });

          setTargetItem({ ...targetItem, currentAmount: newCurrentAmount });
          setIsWithdrawModalOpen(false);
          setWithdrawAmount("");
          loadData();
          alert(`「${targetItem.name}」から ${amount.toLocaleString()}円 を取り崩しました。`);

      } catch(e) {
          alert("取り崩し処理に失敗しました");
      }
  };

  const handleUpdateSettings = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, "users", user.uid);
      const confirmAdd = confirm(`設定を更新しますか？\n(残高リセット値も適用されます)`);
      if (!confirmAdd) return;
      
      const newSettings = { 
        appMode, tempIncomeInvestRatio,
        dailyBudget, monthlyLivingBudget, livingBudgetMode, payday, monthlySavingTarget, monthlyInvestmentTarget, 
        isCsvMode, theme, nisaSettings, isTacticsMode: appMode === 'simple' ? false : isTacticsMode, isUnlimitedArchive,
        surplusAction, targetItem,
        lastProcessedPayday: lastProcessedPaydayState
      };

      // 生活費の残高修正ロジック
      const diff = tempResetValues.living - balance;
      let newHistory = [...history];
      if (diff !== 0) {
          newHistory.push({
              amount: Math.abs(diff),
              category: "その他",
              memo: "手動による残高調整",
              date: new Date().toISOString(),
              type: diff > 0 ? 'income' : 'expense'
          });
      }
      
      await updateDoc(docRef, { 
          settings: newSettings, 
          subscriptions: subscriptions, 
          savings_balance: tempResetValues.special, 
          invest_cash_balance: tempResetValues.investCash, 
          invest_stock_balance: tempResetValues.investStock,
          history: newHistory
      });

      setIsSettingMode(false);
      loadData();
    } catch (e) { alert("更新失敗"); }
  };

  const deleteItem = async (index: number) => {
    if (!user) return;
    if (!confirm("削除しますか？")) return;
    const item = history[index];
    
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    const currentData = docSnap.data();
    let currentSettings = currentData?.settings || {};
    let currentTargetItem = currentSettings.targetItem || null;

    let ns = savings, nic = investCash, nis = investStock;
    if (item.category === "特別支出" || item.category === "コントロール") ns += item.amount;
    else if (item.category === "プール金利用") {
        if (currentTargetItem) {
            currentTargetItem.currentAmount += item.amount;
        }
    }
    else if (item.category === "貯金") nic += item.amount;
    else if (item.category === "投資") { nic += item.amount; nis -= item.amount; }
    else if (item.category === "臨時収入") {
        if (item.isSplit) {
            nic -= (item.investAmount || 0);
            if (currentTargetItem && item.poolAmount) {
                currentTargetItem.currentAmount = Math.max(0, currentTargetItem.currentAmount - item.poolAmount);
            }
        } else {
            nic -= item.amount;
        }
    }
    else if (item.category === "投資回収") { nic -= item.amount; nis += item.amount; }
    else if (item.category === "積立取崩") { ns -= item.amount; }

    const newH = history.filter((_, i) => i !== index);
    
    const updatePayload: any = { 
        history: newH, 
        savings_balance: ns, 
        invest_cash_balance: nic, 
        invest_stock_balance: nis 
    };
    if (item.isSplit || item.category === "プール金利用") {
        updatePayload["settings.targetItem"] = currentTargetItem;
    }

    await updateDoc(docRef, updatePayload);
    loadData();
  };

  const startEdit = (index: number) => {
    const item = history[index];
    setEditIndex(index);
    setEditForm({
      amount: item.amount,
      category: item.category,
      memo: item.memo,
      date: new Date(item.date).toISOString().split('T')[0] 
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateTransaction = async () => {
    if (editIndex === null || !user) return;
    
    try {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      let currentSettings = docSnap.data()?.settings || {};
      let currentTargetItem = currentSettings.targetItem || null;
      
      const oldItem = history[editIndex];
      let ns = savings, nic = investCash, nis = investStock;
      
      const revert = (item: Transaction, add: boolean) => {
          const sign = add ? 1 : -1;
          const amt = item.amount;
          if (item.category === "特別支出" || item.category === "コントロール") ns += amt * sign;
          else if (item.category === "プール金利用") {
              if (currentTargetItem) {
                  currentTargetItem.currentAmount += amt * sign;
              }
          }
          else if (item.category === "貯金") nic += amt * sign;
          else if (item.category === "投資") { nic += amt * sign; nis -= amt * sign; }
          else if (item.category === "臨時収入") {
              if (item.isSplit) {
                  nic -= (item.investAmount || 0) * sign;
                  if (currentTargetItem && item.poolAmount) {
                      currentTargetItem.currentAmount = Math.max(0, currentTargetItem.currentAmount - (item.poolAmount * sign));
                  }
              } else {
                  nic -= amt * sign;
              }
          }
          else if (item.category === "投資回収") { nic -= amt * sign; nis += amt * sign; }
          else if (item.category === "積立取崩") { ns += amt * sign; }
      }
      revert(oldItem, true);

      const newAmount = Number(editForm.amount);
      let isNewSplit = false;
      let newInvestAmt = newAmount;
      let newPoolAmt = 0;

      const apply = (cat: string, amt: number) => {
           if (cat === "特別支出" || cat === "コントロール") ns -= amt;
           else if (cat === "プール金利用") {
               if (currentTargetItem) {
                   currentTargetItem.currentAmount = Math.max(0, currentTargetItem.currentAmount - amt);
               }
           }
           else if (cat === "貯金") nic -= amt;
           else if (cat === "投資") { nic -= amt; nis += amt; }
           else if (cat === "臨時収入") {
               if (appMode === 'technical' && currentTargetItem && surplusAction === 'target') {
                   newInvestAmt = Math.floor(amt * (tempIncomeInvestRatio / 100));
                   newPoolAmt = amt - newInvestAmt;
                   isNewSplit = true;
                   nic += newInvestAmt;
                   currentTargetItem.currentAmount += newPoolAmt;
               } else {
                   nic += amt;
               }
           }
           else if (cat === "臨時収入") nic += amt; 
           else if (cat === "投資回収") { nic += amt; nis -= amt; }
           else if (cat === "積立取崩") { ns += amt; }
      }
      apply(editForm.category, newAmount);

      let newType: 'expense' | 'income' | 'transfer' = 'expense';
      if (editForm.category === "投資") newType = 'transfer';
      else if (editForm.category === "臨時収入" || editForm.category === "投資回収" || editForm.category === "積立取崩") newType = 'income';
      else if (editForm.category === "その他" && newAmount < 0) newType = 'income'; 

      const newHistory = [...history];
      const updateDate = new Date(editForm.date);
      const now = new Date();
      updateDate.setHours(now.getHours(), now.getMinutes());

      const updatedHistoryItem: Transaction = {
        amount: Math.abs(newAmount), 
        category: editForm.category,
        memo: editForm.memo,
        date: updateDate.toISOString(),
        type: newAmount < 0 && editForm.category === "その他" ? 'income' : newType
      };

      if (isNewSplit) {
          updatedHistoryItem.isSplit = true;
          updatedHistoryItem.investAmount = newInvestAmt;
          updatedHistoryItem.poolAmount = newPoolAmt;
          if (!updatedHistoryItem.memo.includes('(按分済)')) {
              updatedHistoryItem.memo = updatedHistoryItem.memo ? `${updatedHistoryItem.memo} (按分済)` : '(投資/プール按分済)';
          }
      }

      newHistory[editIndex] = updatedHistoryItem;

      const updatePayload: any = { 
        history: newHistory, 
        savings_balance: ns, 
        invest_cash_balance: nic, 
        invest_stock_balance: nis 
      };

      if (oldItem.isSplit || isNewSplit || oldItem.category === "プール金利用" || editForm.category === "プール金利用") {
          updatePayload["settings.targetItem"] = currentTargetItem;
      }

      await updateDoc(docRef, updatePayload);

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

  const displayHistory = showAllHistory ? history : history.slice(0, 5);
  const currentCategories = (isTacticsMode && appMode === 'technical') ? tacticsCategories : normalCategories;

  const monthlyBaseExpense = (livingBudgetMode === 'daily' ? dailyBudget * 30 : monthlyLivingBudget) + monthlySavingTarget;
  const defenseFundLine1 = monthlyBaseExpense * 3;
  const defenseFundLine2 = monthlyBaseExpense * 6;
  const defenseStatus = investCash >= defenseFundLine2 ? 2 : investCash >= defenseFundLine1 ? 1 : 0;
  
  const isTargetReached = targetItem && targetItem.currentAmount >= targetItem.targetAmount;

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 font-mono">Loading App...</div>;

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
            <h1 className={`text-xl font-bold tracking-tight ${isUnlimitedArchive && appMode === 'technical' ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-pink-500 drop-shadow-sm' : 'dark:text-white'}`}>
              3つの財布 {(isUnlimitedArchive && appMode === 'technical') && <span className="text-lg text-amber-500 align-top">∞</span>}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-widest uppercase">Hi, {user.displayName?.split(" ")[0]}</p>
              {appMode === 'simple' ? (
                <span className="text-[10px] bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400 px-1.5 py-0.5 rounded font-bold uppercase">Simple Mode</span>
              ) : isTacticsMode ? (
                <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold uppercase">Tactics Mode</span>
              ) : (
                <span className="text-[10px] bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 px-1.5 py-0.5 rounded font-bold uppercase">Technical Normal</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleLogout} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-full shadow-sm hover:bg-gray-50 transition-all text-xs font-bold text-gray-500">LOGOUT</button>
            <button onClick={() => setIsHelpModalOpen(true)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 w-8 h-8 rounded-full shadow-sm hover:bg-gray-50 transition-all flex items-center justify-center font-bold text-gray-500 text-xs">
                ?
            </button>
            <button onClick={() => setIsSettingMode(!isSettingMode)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded-full shadow-sm hover:bg-gray-50 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-300"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

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

        {tacticsGuideType !== null && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700 max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                           {tacticsGuideType === 'defense' ? (
                             <>
                               <span className="text-lg">🏰</span> 生活防衛資金
                             </>
                           ) : (
                             <>
                               <span className="text-lg">⚔️</span> Tactics Mode 定義
                             </>
                           )}
                        </h3>
                        <button onClick={() => setTacticsGuideType(null)} className="text-gray-400 hover:text-gray-600">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <TacticsGuide type={tacticsGuideType} />
                </div>
            </div>
        )}

        {isRecoverModalOpen && (
             <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700">
                   <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
                     <span className="text-lg">♻️</span> 投資回収（リバランス）
                   </h3>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                     投資資産（Stock）から現金（Cash）へ資金を移動します。
                     <br/><span className="text-[10px] opacity-70">※現在の資産残高: ¥{investStock.toLocaleString()}</span>
                   </p>
                   <div className="space-y-3">
                     <div>
                       <label className="text-[10px] text-gray-400 block mb-1">回収金額</label>
                       <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
                         value={recoverAmount} onChange={(e)=>setRecoverAmount(e.target.value)} placeholder="0" />
                     </div>
                     <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={()=>setIsRecoverModalOpen(false)} className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg">キャンセル</button>
                        <button onClick={handleRecover} className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg shadow-lg">回収実行</button>
                     </div>
                   </div>
                </div>
              </div>
        )}

        {isWithdrawModalOpen && targetItem && (
             <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700">
                   <h3 className="text-sm font-bold text-pink-600 dark:text-pink-400 mb-4 flex items-center gap-2">
                     <span className="text-lg">💸</span> プール金の取り崩し
                   </h3>
                   <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                     「{targetItem.name}」から指定した金額を取り崩して特別費に充当します。
                     <br/><span className="text-[10px] opacity-70">※現在の積立額: ¥{targetItem.currentAmount.toLocaleString()}</span>
                   </p>
                   <div className="space-y-3">
                     <div>
                       <label className="text-[10px] text-gray-400 block mb-1">取崩金額</label>
                       <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
                         value={withdrawAmount} onChange={(e)=>setWithdrawAmount(e.target.value)} placeholder="0" />
                     </div>
                     <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={()=>setIsWithdrawModalOpen(false)} className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg">キャンセル</button>
                        <button onClick={handlePartialWithdraw} className="flex-1 py-2 text-xs font-bold text-white bg-pink-500 rounded-lg shadow-lg">実行</button>
                     </div>
                   </div>
                </div>
              </div>
        )}

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
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden animation-fade-in max-w-md mx-auto">
             <div className="bg-blue-600 p-4 text-center">
               <h2 className="text-white font-bold text-sm tracking-widest uppercase">Settings</h2>
             </div>
             <div className="p-6 space-y-8 max-h-[75vh] overflow-y-auto">
               
               <section>
                 <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">アプリモード設定</h3>
                 <div className="flex gap-2 mb-2">
                    <button onClick={()=>{setAppMode('simple'); setIsTacticsMode(false);}} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${appMode === 'simple' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>シンプルモード</button>
                    <button onClick={()=>setAppMode('technical')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${appMode === 'technical' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>テクニカルモード</button>
                 </div>
                 <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    {appMode === 'simple' ? '「3つの財布」の基本機能のみを使用するシンプルなモードです。' : 'Tactics Mode、臨時収入の按分、自動積立などの高度な機能が利用できます。'}
                 </p>
               </section>

               {appMode === 'technical' && (
                 <>
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
                       <button onClick={() => setTacticsGuideType('all')} className="w-full text-center text-[10px] text-blue-500 underline py-1">
                         【定義を確認】義務・裁量の分類例
                       </button>
                     )}
                   </section>

                   <section>
                     <h3 className="text-xs font-bold text-pink-500 uppercase mb-3 border-b border-pink-100 dark:border-pink-900 pb-1">余剰金の扱い</h3>
                     <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-xl mb-2">
                        <p className="text-[10px] text-gray-500 dark:text-gray-300 mb-2">
                            月予算（生活費・特別費）が余った場合の行き先:
                        </p>
                        <div className="flex gap-2 mb-3">
                            <button onClick={()=>setSurplusAction('save')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${surplusAction==='save' ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-500'}`}>
                                貯金へ
                            </button>
                            <button onClick={()=>setSurplusAction('target')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${surplusAction==='target' ? 'bg-pink-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-500'}`}>
                                プール金(欲しい物)へ
                            </button>
                        </div>
                        {surplusAction === 'target' && (
                            <div className="bg-white dark:bg-gray-700 p-2 rounded-lg space-y-2">
                                <div>
                                    <label className="text-[10px] text-gray-400 block">プール金 / 欲しい物 (名称)</label>
                                    <input type="text" className="w-full p-1 border-b border-gray-200 dark:border-gray-600 bg-transparent text-xs" 
                                        value={targetItem?.name || ""} onChange={(e)=>setTargetItem({...targetItem, name: e.target.value, targetAmount: targetItem?.targetAmount||0, currentAmount: targetItem?.currentAmount||0})} placeholder="例: プール金枠 / 新しいテレビ" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 block">目標金額 (上限目安)</label>
                                    <input type="number" className="w-full p-1 border-b border-gray-200 dark:border-gray-600 bg-transparent text-xs"
                                        value={targetItem?.targetAmount || ""} onChange={(e)=>setTargetItem({...targetItem, name: targetItem?.name||"", targetAmount: Number(e.target.value), currentAmount: targetItem?.currentAmount||0})} placeholder="100000" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-400 block">現在の積立額 (手動修正)</label>
                                    <input type="number" className="w-full p-1 border-b border-gray-200 dark:border-gray-600 bg-transparent text-xs"
                                        value={targetItem?.currentAmount || ""} onChange={(e)=>setTargetItem({...targetItem, name: targetItem?.name||"", targetAmount: targetItem?.targetAmount||0, currentAmount: Number(e.target.value)})} placeholder="0" />
                                </div>
                                <p className="text-[9px] text-gray-400 mt-1">※この枠は、不定期な出費用のプール金としても運用可能です。</p>
                            </div>
                        )}
                     </div>
                   </section>

                   <section>
                      <h3 className="text-xs font-bold text-amber-500 uppercase mb-3 border-b border-amber-100 dark:border-amber-900 pb-1">臨時収入の按分コントロール</h3>
                      <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl mb-2">
                         <p className="text-[10px] text-gray-500 dark:text-gray-300 mb-2 leading-relaxed">
                            臨時収入があった際、「投資」と「プール金(Target枠)」へ自動で振り分けます。<br/>
                            <span className="font-bold text-amber-600 dark:text-amber-400">推奨設定: 投資 50% / プール金 50%</span>
                         </p>
                         <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center">
                               <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">投資</span>
                               <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">{tempIncomeInvestRatio}%</span>
                            </div>
                            <input type="range" min="0" max="100" step="10" value={tempIncomeInvestRatio} onChange={(e) => setTempIncomeInvestRatio(Number(e.target.value))} className="flex-1 accent-amber-500" />
                            <div className="flex flex-col items-center">
                               <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400">プール</span>
                               <span className="text-sm font-bold font-mono text-pink-600 dark:text-pink-400">{100 - tempIncomeInvestRatio}%</span>
                            </div>
                         </div>
                         {surplusAction !== 'target' && (
                            <p className="text-[10px] text-red-500 mt-2 font-bold">※現在「余剰金の扱い」が「貯金へ」になっているため、臨時収入は全額投資(現金)へ回ります。按分するには「プール金へ」を選択してください。</p>
                         )}
                      </div>
                   </section>
                 </>
               )}

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
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">{(isTacticsMode && appMode === 'technical') ? "アンコントロール(生活費) 残高" : "生活費 残高"}</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.living} onChange={(e)=>setTempResetValues({...tempResetValues, living: Number(e.target.value)})} /></div>
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">{(isTacticsMode && appMode === 'technical') ? "コントロール(特別費) 残高" : "特別費 残高"}</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.special} onChange={(e)=>setTempResetValues({...tempResetValues, special: Number(e.target.value)})} /></div>
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">貯金(現金) 残高</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.investCash} onChange={(e)=>setTempResetValues({...tempResetValues, investCash: Number(e.target.value)})} /></div>
                   <div className="flex items-center justify-between"><label className="text-xs font-bold text-gray-600 dark:text-gray-300">投資(資産) 残高</label><input type="number" className="w-32 p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 rounded-lg text-right font-mono text-sm" value={tempResetValues.investStock} onChange={(e)=>setTempResetValues({...tempResetValues, investStock: Number(e.target.value)})} /></div>
                 </div>
               </section>
               
               {appMode === 'technical' && (
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
               )}

               <section>
                   <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">表示設定</h3>
                   <div className="flex gap-2 mb-4">{(['light', 'dark', 'system'] as ThemeOption[]).map(t => (<button key={t} onClick={()=>setTheme(t)} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme===t ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>{t === 'light' ? 'ライト' : t === 'dark' ? 'ダーク' : '自動'}</button>))}</div>
                   <div className="flex items-center justify-between"><span className="text-xs text-gray-500">CSV出力機能</span><input type="checkbox" checked={isCsvMode} onChange={(e)=>setIsCsvMode(e.target.checked)} /></div>
                   {isCsvMode && <button onClick={downloadCSV} className="mt-2 text-xs text-green-600 underline block mb-4">過去データのダウンロード</button>}
                   
                   {appMode === 'technical' && (
                     <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                         <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] text-gray-400 font-bold uppercase">高度な設定 (保存期間)</span>
                             {isUnlimitedArchive ? (
                                 <span className="text-[10px] bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded font-bold">無制限モード有効</span>
                             ) : (
                                 <span className="text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 px-2 py-0.5 rounded font-bold">直近6ヶ月</span>
                             )}
                         </div>
                         {!isUnlimitedArchive && (
                             <div className="flex gap-2">
                                 <input type="password" placeholder="認証コード(4桁)" maxLength={4} className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs text-center tracking-widest font-mono" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} />
                                 <button onClick={() => { 
                                     if(secretCode === '0322') { 
                                         setIsUnlimitedArchive(true); 
                                         alert('無制限モードが解放されました。\n設定を保存してください。'); 
                                     } else { 
                                         alert('コードが違います'); 
                                         setSecretCode(''); 
                                     } 
                                 }} className="bg-gray-800 dark:bg-gray-600 text-white text-xs px-3 rounded shadow-sm hover:bg-gray-700">適用</button>
                             </div>
                         )}
                     </div>
                   )}
               </section>
               
               <button onClick={handleUpdateSettings} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold text-sm shadow-lg transition-transform active:scale-95">設定を保存して戻る</button>
             </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in-up">
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-blue-50 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10 flex justify-between items-start">
                     <p className="text-[10px] font-bold text-blue-400 dark:text-blue-300 mb-1 uppercase tracking-wider">
                       {(isTacticsMode && appMode === 'technical') ? "🛡️【義務】アンコントロール" : "生活費残高"}
                     </p>
                     {(isTacticsMode && appMode === 'technical') && (
                        <button onClick={() => setTacticsGuideType('uncontrol')} className="text-blue-400 hover:text-blue-600 -mt-1 -mr-1 p-1">
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </button>
                     )}
                  </div>
                  <p className={`text-2xl font-mono font-bold relative z-10 ${balance < 0 ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>¥{balance.toLocaleString()}</p>
                  <p className="text-[8px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                    {(isTacticsMode && appMode === 'technical') ? "Uncontrollable Expenses" : (livingBudgetMode === 'daily' ? 'Daily Accumulation' : 'Monthly Budget')}
                  </p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-pink-50 dark:border-gray-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-pink-50 dark:bg-pink-900/20 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10 flex justify-between items-start">
                     <p className="text-[10px] font-bold text-pink-400 dark:text-pink-300 mb-1 uppercase tracking-wider">
                       {(isTacticsMode && appMode === 'technical') ? "🎮【裁量】コントロール" : "特別費"}
                     </p>
                     {(isTacticsMode && appMode === 'technical') && (
                        <button onClick={() => setTacticsGuideType('control')} className="text-pink-400 hover:text-pink-600 -mt-1 -mr-1 p-1">
                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </button>
                     )}
                  </div>
                  <p className={`text-2xl font-mono font-bold relative z-10 ${savings < 0 ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>¥{savings.toLocaleString()}</p>
                  {(isTacticsMode && appMode === 'technical') && <p className="text-[8px] text-gray-400 dark:text-gray-500 mt-1 font-mono">Controllable Expenses</p>}
              </div>

              <div className="col-span-2 md:col-span-1 bg-gradient-to-r from-indigo-600 to-violet-600 p-5 rounded-3xl shadow-lg text-white relative overflow-hidden">
                  <div className="absolute opacity-10 top-[-20px] left-[-20px] w-32 h-32 bg-white rounded-full blur-2xl"></div>
                  <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3 opacity-90">
                          <p className="text-[10px] font-bold uppercase tracking-widest">貯金と投資</p>
                          <div className="flex items-center gap-2">
                             {defenseStatus > 0 && (
                               <div className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded backdrop-blur-sm text-[9px] font-bold animate-pulse">
                                 <span>{defenseStatus === 2 ? '🏰' : '🛡️'}</span>
                                 <span>{defenseStatus === 2 ? '盤石' : '安心'}</span>
                               </div>
                             )}
                             <button onClick={() => setTacticsGuideType('defense')} className="bg-white/20 hover:bg-white/30 p-1 rounded backdrop-blur-sm transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                             </button>
                          </div>
                      </div>
                      <div className="flex divide-x divide-white/20">
                          <div className="pr-4 flex-1">
                              <p className="text-[9px] opacity-70 mb-0.5">現金 (貯金)</p>
                              <p className="text-xl font-mono font-bold">¥{investCash.toLocaleString()}</p>
                          </div>
                          <div className="pl-4 flex-1">
                              <div className="flex justify-between items-start">
                                <p className="text-[9px] opacity-70 mb-0.5">投資 (資産)</p>
                                <button onClick={() => setIsRecoverModalOpen(true)} className="bg-white/20 hover:bg-white hover:text-indigo-600 text-white rounded p-1 transition-colors shadow-sm" title="回収（リバランス）">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                                </button>
                              </div>
                              <p className="text-xl font-mono font-bold">¥{investStock.toLocaleString()}</p>
                          </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-white/10">
                         <div className="flex justify-between text-[8px] opacity-70 mb-1 font-mono">
                           <span>Life Defense Fund</span>
                           <span>{Math.round((investCash / defenseFundLine2) * 100)}%</span>
                         </div>
                         <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden relative">
                           <div className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-20" style={{ left: '50%' }}></div>
                           <div className={`h-full rounded-full transition-all duration-1000 ${defenseStatus === 2 ? 'bg-green-400' : defenseStatus === 1 ? 'bg-yellow-400' : 'bg-white/50'}`} style={{ width: `${Math.min((investCash / defenseFundLine2) * 100, 100)}%` }}></div>
                         </div>
                         <div className="flex justify-between text-[7px] opacity-50 mt-1 font-mono">
                           <span>0</span>
                           <span className="text-center w-full -ml-4">3Mo</span>
                           <span>6Mo</span>
                         </div>
                      </div>
                  </div>
              </div>
            </div>

            {(appMode === 'technical' && surplusAction === 'target' && targetItem) && (
               <div className={`p-4 rounded-2xl shadow-sm text-white relative overflow-hidden animate-fade-in transition-all duration-500 ${isTargetReached ? 'bg-gradient-to-r from-yellow-400 to-orange-500 ring-4 ring-yellow-200 dark:ring-yellow-900' : 'bg-gradient-to-r from-pink-500 to-rose-500'}`}>
                  <div className="absolute opacity-10 top-[-10px] right-[-10px] w-24 h-24 bg-white rounded-full blur-xl"></div>
                  <div className="relative z-10">
                      <div className="flex justify-between items-center mb-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">{isTargetReached ? "Goal Reached! 🎉" : "Current Target Pool"}</p>
                          <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">{targetItem.targetAmount > 0 ? Math.round((targetItem.currentAmount / targetItem.targetAmount) * 100) : 0}%</span>
                      </div>
                      <h3 className="text-lg font-bold mb-2">{targetItem.name}</h3>
                      <div className="flex justify-between items-end text-xs font-mono mb-2">
                          <span className="text-xl font-bold">¥{targetItem.currentAmount.toLocaleString()}</span>
                          <span className="opacity-70">/ ¥{targetItem.targetAmount.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-black/20 rounded-full h-2 overflow-hidden mb-2">
                          <div className={`h-full bg-white transition-all duration-1000 ${isTargetReached ? 'animate-pulse' : ''}`} style={{ width: targetItem.targetAmount > 0 ? `${Math.min((targetItem.currentAmount / targetItem.targetAmount) * 100, 100)}%` : '100%' }}></div>
                      </div>
                      
                      {targetItem.currentAmount > 0 ? (
                          <div className="flex gap-2 mt-3">
                              <button onClick={() => setIsWithdrawModalOpen(true)} className="flex-1 py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-lg shadow-sm transition-colors backdrop-blur-sm border border-white/20">
                                  💸 一部取崩
                              </button>
                              <button onClick={handlePurchaseTarget} className="flex-[2] py-2 bg-white text-orange-600 font-bold text-xs rounded-lg shadow-md hover:bg-gray-100 transition-transform active:scale-95 animate-bounce">
                                  🎁 GET! (全額)
                              </button>
                          </div>
                      ) : (
                          <p className="text-[9px] opacity-70 mt-1 text-right">余剰金・臨時収入から自動積立中</p>
                      )}
                  </div>
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="space-y-6">
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                      <div className="flex flex-wrap gap-2 mb-4 justify-center">
                        {currentCategories.map(cat => (
                          <button key={cat} onClick={() => setCategory(cat)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              category === cat 
                                ? (['投資','貯金','臨時収入'].includes(cat) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' : (cat === '特別支出' || cat === 'コントロール' || cat === 'プール金利用') ? 'bg-pink-500 text-white shadow-md shadow-pink-200 dark:shadow-none' : (cat === '投資回収' ? 'bg-gray-600 text-white' : (cat === '積立取崩' ? 'bg-indigo-300 text-white' : 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none'))) 
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
                             <button onClick={handlePayment} className={`h-full text-white rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all uppercase tracking-widest ${['投資','貯金','臨時収入'].includes(category) ? 'bg-indigo-600' : (category === '特別支出' || category === 'コントロール' || category === 'プール金利用') ? 'bg-pink-500' : 'bg-blue-600'}`}>
                               決定
                             </button>
                          </div>
                        </div>
                        <input type="text" placeholder="メモを入力..."
                          className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs outline-none focus:bg-white dark:focus:bg-gray-700 transition-colors dark:text-white"
                          value={memo} onChange={(e) => setMemo(e.target.value)} />
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                      <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-4 uppercase tracking-widest">直近の履歴</h3>
                      <div className="space-y-4">
                        {displayHistory.map((item, index) => {
                          return (
                            <div key={index} className="flex items-start justify-between border-b border-gray-50 dark:border-gray-700 pb-3 last:border-0">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${['投資','貯金','臨時収入'].includes(item.category) ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' : (item.category === '特別支出' || item.category === 'コントロール' || item.category === 'プール金利用') ? 'bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300' : (item.category === '投資回収' ? 'bg-gray-200 text-gray-600' : (item.category === '積立取崩' ? 'bg-indigo-50 text-indigo-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'))}`}>{item.category}</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{new Date(item.date).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-sm font-mono font-bold ${item.category === '臨時収入' || item.category === '投資回収' || item.category === '積立取崩' ? 'text-green-500' : 'text-gray-700 dark:text-gray-200'}`}>
                                      {item.category === '臨時収入' || item.category === '投資回収' || item.category === '積立取崩' ? '+' : ''}¥{item.amount.toLocaleString()}
                                    </span>
                                    {item.type === 'transfer' && <span className="text-[8px] text-indigo-400 bg-indigo-50 dark:bg-indigo-900/50 px-1 rounded">振替</span>}
                                    {item.isSplit && <span className="text-[8px] text-amber-500 bg-amber-50 dark:bg-amber-900/50 px-1 rounded border border-amber-200 dark:border-amber-700">按分済</span>}
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
                      
                      {history.length > 5 && (
                        <button 
                          onClick={() => setShowAllHistory(!showAllHistory)}
                          className="w-full mt-4 py-2 text-xs font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition-colors border border-dashed border-blue-200 dark:border-gray-600"
                        >
                          {showAllHistory ? "Close" : "Read More..."}
                        </button>
                      )}
                    </div>
                    
                    {/* 月次残高記録の表示（無制限モード時） */}
                    {isUnlimitedArchive && monthlyBalances.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                           <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-4 uppercase tracking-widest flex items-center justify-between">
                               <span>月次残高記録 (無制限モード)</span>
                               <span className="bg-green-100 text-green-600 px-1.5 py-0.5 rounded text-[8px]">Saved</span>
                           </h3>
                           <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                              {monthlyBalances.slice().reverse().map((rec, i) => (
                                  <div key={i} className="flex justify-between items-center text-xs p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600/50">
                                      <span className="font-mono text-gray-500 dark:text-gray-400 font-bold">{rec.month}〜</span>
                                      <div className="flex gap-3 text-right">
                                          <div className="flex flex-col">
                                              <span className="text-[8px] text-blue-400">生活(アンコン)</span>
                                              <span className={`font-mono font-bold ${rec.uncontrol < 0 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>¥{rec.uncontrol.toLocaleString()}</span>
                                          </div>
                                          <div className="flex flex-col pl-2 border-l border-gray-200 dark:border-gray-600">
                                              <span className="text-[8px] text-pink-400">特別(コン)</span>
                                              <span className={`font-mono font-bold ${rec.control < 0 ? 'text-red-500' : 'text-pink-600 dark:text-pink-400'}`}>¥{rec.control.toLocaleString()}</span>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                           </div>
                        </div>
                    )}
                </div>

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