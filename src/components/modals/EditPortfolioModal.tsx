import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Portfolio } from '../../types';

interface EditPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: (id: string, updates: Partial<Portfolio>) => void;
  portfolio: Portfolio | null;
}

export function EditPortfolioModal({ isOpen, onClose, onEdit, portfolio }: EditPortfolioModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [goal, setGoal] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [besEntryDate, setBesEntryDate] = useState('');

  useEffect(() => {
    if (portfolio) {
      setName(portfolio.name);
      setDesc(portfolio.description || '');
      setGoal(portfolio.monthlyGoal?.toString() || '');
      setBirthDate(portfolio.birthDate || '');
      setBesEntryDate(portfolio.besEntryDate || '');
    }
  }, [portfolio]);

  if (!isOpen || !portfolio) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Edit Portfolio</h3>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Portfolio Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Retirement"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Birth Date</label>
              <input 
                type="date" 
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">BES Entry Date</label>
              <input 
                type="date" 
                value={besEntryDate}
                onChange={(e) => setBesEntryDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monthly Passive Income Goal (USD)</label>
            <input 
              type="number" 
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. 1000"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What is this portfolio for?"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none transition-colors"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onEdit(portfolio.id, {
                name,
                description: desc,
                monthlyGoal: parseFloat(goal) || 0,
                birthDate: birthDate || null as any,
                besEntryDate: besEntryDate || null as any
              });
              onClose();
            }}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}
