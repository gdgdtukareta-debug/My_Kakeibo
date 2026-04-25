
import React from 'react';
import {
    AppMode, BudgetMode, SurplusAction, TargetItem,
    ThemeOption, Subscription, NisaSettings
} from '../types';

type SettingsModalProps = {
    appMode: AppMode;
    setAppMode: (mode: AppMode) => void;
    isTacticsMode: boolean;
    setIsTacticsMode: (val: boolean) => void;
    surplusAction: SurplusAction;
    setSurplusAction: (val: SurplusAction) => void;
    targetItem: TargetItem | null;
    setTargetItem: (item: TargetItem | null) => void;
    tempIncomeInvestRatio: number;
    setTempIncomeInvestRatio: (val: number) => void;
    totalMonthlyIncome: number;
    setTotalMonthlyIncome: (val: number) => void;
    calculateBudgetDistribution: () => void;
    livingBudgetMode: BudgetMode;
    setLivingBudgetMode: (mode: BudgetMode) => void;
    dailyBudget: number;
    setDailyBudget: (val: number) => void;
    monthlyLivingBudget: number;
    setMonthlyLivingBudget: (val: number) => void;
    payday: number;
    setPayday: (val: number) => void;
    monthlySavingTarget: number;
    setMonthlySavingTarget: (val: number) => void;
    monthlyInvestmentTarget: number;
    setMonthlyInvestmentTarget: (val: number) => void;
    tempResetValues: { special: number, investCash: number, investStock: number, living: number };
    setTempResetValues: (val: any) => void;
    nisaSettings: NisaSettings;
    setNisaSettings: (val: NisaSettings) => void;
    subscriptions: Subscription[];
    setSubscriptions: (val: Subscription[]) => void;
    theme: ThemeOption;
    setTheme: (val: ThemeOption) => void;
    isCsvMode: boolean;
    setIsCsvMode: (val: boolean) => void;
    isUnlimitedArchive: boolean;
    setIsUnlimitedArchive: (val: boolean) => void;
    secretCode: string;
    setSecretCode: (val: string) => void;
    downloadCSV: () => void;
    handleUpdateSettings: () => void;
    setIsSettingMode: (val: boolean) => void;
    setTacticsGuideType: (val: any) => void;
};

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
    const {
        appMode, setAppMode, isTacticsMode, setIsTacticsMode, surplusAction, setSurplusAction,
        targetItem, setTargetItem, tempIncomeInvestRatio, setTempIncomeInvestRatio,
        totalMonthlyIncome, setTotalMonthlyIncome, calculateBudgetDistribution,
        livingBudgetMode, setLivingBudgetMode, dailyBudget, setDailyBudget,
        monthlyLivingBudget, setMonthlyLivingBudget, payday, setPayday,
        monthlySavingTarget, setMonthlySavingTarget, monthlyInvestmentTarget, setMonthlyInvestmentTarget,
        tempResetValues, setTempResetValues, nisaSettings, setNisaSettings,
        subscriptions, setSubscriptions, theme, setTheme, isCsvMode, setIsCsvMode,
        isUnlimitedArchive, setIsUnlimitedArchive, secretCode, setSecretCode,
        downloadCSV, handleUpdateSettings, setIsSettingMode, setTacticsGuideType
    } = props;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden animation-fade-in max-w-md mx-auto">
            <div className="bg-blue-600 p-4 text-center">
                <h2 className="text-white font-bold text-sm tracking-widest uppercase">Settings</h2>
            </div>
            <div className="p-6 space-y-8 max-h-[75vh] overflow-y-auto">

                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">アプリモード設定</h3>
                    <div className="flex gap-2 mb-2">
                        <button onClick={() => { setAppMode('simple'); setIsTacticsMode(false); }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${appMode === 'simple' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>シンプルモード</button>
                        <button onClick={() => setAppMode('technical')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${appMode === 'technical' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>テクニカルモード</button>
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
                                    <input type="checkbox" checked={isTacticsMode} onChange={(e) => setIsTacticsMode(e.target.checked)} className="toggle" />
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
                                    <button onClick={() => setSurplusAction('save')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${surplusAction === 'save' ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-500'}`}>
                                        貯金へ
                                    </button>
                                    <button onClick={() => setSurplusAction('target')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${surplusAction === 'target' ? 'bg-pink-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-500'}`}>
                                        プール金(欲しい物)へ
                                    </button>
                                </div>
                                {surplusAction === 'target' && (
                                    <div className="bg-white dark:bg-gray-700 p-2 rounded-lg space-y-2">
                                        <div>
                                            <label className="text-[10px] text-gray-400 block">プール金 / 欲しい物 (名称)</label>
                                            <input type="text" className="w-full p-1 border-b border-gray-200 dark:border-gray-600 bg-transparent text-xs"
                                                value={targetItem?.name || ""} onChange={(e) => setTargetItem({ ...targetItem, name: e.target.value, targetAmount: targetItem?.targetAmount || 0, currentAmount: targetItem?.currentAmount || 0 })} placeholder="例: プール金枠 / 新しいテレビ" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-400 block">目標金額 (上限目安)</label>
                                            <input type="number" className="w-full p-1 border-b border-gray-200 dark:border-gray-600 bg-transparent text-xs"
                                                value={targetItem?.targetAmount || ""} onChange={(e) => setTargetItem({ ...targetItem, name: targetItem?.name || "", targetAmount: Number(e.target.value), currentAmount: targetItem?.currentAmount || 0 })} placeholder="100000" />
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
                                    臨時収入があった際、「投資」と「プール金(Target枠)」へ自動で振り分けます。<br />
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
                            <input type="number" placeholder="例: 300000" className="flex-1 p-2 bg-white dark:bg-gray-700 rounded text-sm" value={totalMonthlyIncome || ""} onChange={(e) => setTotalMonthlyIncome(Number(e.target.value))} />
                            <button onClick={calculateBudgetDistribution} className="bg-blue-600 text-white text-xs font-bold px-3 rounded shadow-sm">反映</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300">生活費予算モード</span>
                            <div className="flex gap-1">
                                <button onClick={() => setLivingBudgetMode('daily')} className={`px-2 py-1 text-[10px] rounded ${livingBudgetMode === 'daily' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>日割(積上)</button>
                                <button onClick={() => setLivingBudgetMode('monthly')} className={`px-2 py-1 text-[10px] rounded ${livingBudgetMode === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>月額(減算)</button>
                            </div>
                        </div>
                        {livingBudgetMode === 'daily' ? (
                            <div><label className="text-[10px] text-gray-400 block mb-1">1日の生活費予算</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={dailyBudget || ""} onChange={(e) => setDailyBudget(Number(e.target.value))} /></div>
                        ) : (
                            <div><label className="text-[10px] text-gray-400 block mb-1">1ヶ月の生活費予算</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlyLivingBudget || ""} onChange={(e) => setMonthlyLivingBudget(Number(e.target.value))} /></div>
                        )}
                        <div><label className="text-[10px] text-gray-400 block mb-1">給料日</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={payday || ""} onChange={(e) => setPayday(Number(e.target.value))} /></div>
                        <div><label className="text-[10px] text-gray-400 block mb-1">特別費積立(月)</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlySavingTarget || ""} onChange={(e) => setMonthlySavingTarget(Number(e.target.value))} /></div>
                        <div><label className="text-[10px] text-gray-400 block mb-1">貯金・投資積立(月)</label><input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm" value={monthlyInvestmentTarget || ""} onChange={(e) => setMonthlyInvestmentTarget(Number(e.target.value))} /></div>
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
                            <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">NISA自動積立</span><input type="checkbox" checked={nisaSettings.enabled} onChange={(e) => setNisaSettings({ ...nisaSettings, enabled: e.target.checked })} className="toggle" /></div>
                            {nisaSettings.enabled && (<div className="flex gap-2"><input type="number" placeholder="金額" className="flex-1 p-2 rounded text-xs" value={nisaSettings.amount || ""} onChange={(e) => setNisaSettings({ ...nisaSettings, amount: Number(e.target.value) })} /><input type="number" placeholder="日" className="w-16 p-2 rounded text-xs" value={nisaSettings.day || ""} onChange={(e) => setNisaSettings({ ...nisaSettings, day: Number(e.target.value) })} /></div>)}
                        </div>
                        <div className="mb-2">
                            <div className="flex justify-between items-center mb-2"><label className="text-[10px] text-gray-400 font-bold uppercase">サブスクリプション</label><button onClick={() => { const n = prompt("名称"); if (!n) return; const a = prompt("金額"); if (!a) return; const d = prompt("支払日"); const c = prompt("カテゴリ", "その他"); setSubscriptions([...subscriptions, { id: Date.now(), name: n, amount: Number(a), payDay: d ? Number(d) : "", category: c || "その他", lastPaidMonth: "" }]); }} className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded font-bold">追加</button></div>
                            <div className="space-y-1">{subscriptions.map(s => (<div key={s.id} className="flex justify-between text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded"><span>{s.name} (¥{s.amount})</span><button onClick={() => setSubscriptions(subscriptions.filter(i => i.id !== s.id))} className="text-red-400">削除</button></div>))}</div>
                        </div>
                    </section>
                )}

                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">表示設定</h3>
                    <div className="flex gap-2 mb-4">{(['light', 'dark', 'system'] as ThemeOption[]).map(t => (<button key={t} onClick={() => setTheme(t)} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${theme === t ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>{t === 'light' ? 'ライト' : t === 'dark' ? 'ダーク' : '自動'}</button>))}</div>
                    <div className="flex items-center justify-between"><span className="text-xs text-gray-500">CSV出力機能</span><input type="checkbox" checked={isCsvMode} onChange={(e) => setIsCsvMode(e.target.checked)} /></div>
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
                                        if (secretCode === '0322') {
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
    );
};
