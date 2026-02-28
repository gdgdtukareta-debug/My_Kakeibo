
import React from 'react';
import { Transaction } from '../types';

type EditTransactionModalProps = {
    editForm: { amount: number, category: string, memo: string, date: string };
    setEditForm: (form: any) => void;
    currentCategories: string[];
    handleUpdateTransaction: () => void;
    setIsEditModalOpen: (val: boolean) => void;
};

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
    editForm, setEditForm, currentCategories, handleUpdateTransaction, setIsEditModalOpen
}) => {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm animation-fade-in border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    履歴の編集
                </h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-gray-400 block mb-1">金額</label>
                        <input type="number" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
                            value={editForm.amount || ""} onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })} />
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-400 block mb-1">日付</label>
                        <input type="date" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm font-mono"
                            value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-400 block mb-1">カテゴリ</label>
                        <select className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs"
                            value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                            {currentCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-400 block mb-1">メモ</label>
                        <input type="text" className="w-full p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs"
                            value={editForm.memo} onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })} />
                    </div>
                    <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg">キャンセル</button>
                        <button onClick={handleUpdateTransaction} className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg shadow-lg">保存する</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
