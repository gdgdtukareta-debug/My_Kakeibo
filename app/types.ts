
export type Transaction = {
    amount: number;
    category: string;
    memo: string;
    date: string;
    type?: 'expense' | 'income' | 'transfer';
    isSplit?: boolean;
    investAmount?: number;
    poolAmount?: number;
};

export type Subscription = {
    id: number;
    name: string;
    amount: number;
    payDay: number | "";
    category: string;
    lastPaidMonth: string;
};

export type TargetItem = {
    name: string;
    targetAmount: number;
    currentAmount: number;
};

export type AppMode = 'simple' | 'technical';
export type ThemeOption = 'light' | 'dark' | 'system';
export type BudgetMode = 'daily' | 'monthly';
export type SurplusAction = 'save' | 'target';

export type Archives = { [key: string]: Transaction[] };

export type NisaSettings = {
    enabled: boolean;
    amount: number;
    day: number;
    lastProcessedMonth: string;
};
