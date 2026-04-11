import React, { useState } from 'react';
import { 
  Wallet, 
  User as UserIcon, 
  Plus, 
  Trash2, 
  ChevronRight,
  Settings as SettingsIcon,
  Shield,
  Bell,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Portfolio } from '../types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { cn, formatCurrency } from '../lib/utils';
import { AddPortfolioModal } from './modals/AddPortfolioModal';

interface SettingsProps {
  portfolios: Portfolio[];
  onAddPortfolio: (name: string, desc: string, goal: number) => void;
  onDeletePortfolio: (id: string) => void;
}

type SettingsTab = 'portfolios' | 'profile' | 'security' | 'notifications' | 'data';

export function Settings({ portfolios, onAddPortfolio, onDeletePortfolio }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('portfolios');
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);

  const tabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'portfolios', label: 'Portfolios', icon: Wallet },
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'data', label: 'Data Management', icon: Database },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-2 transition-colors sticky top-24">
            <div className="p-4 mb-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-indigo-600" />
                Settings
              </h2>
            </div>
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                    activeTab === tab.id
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                  {activeTab === tab.id && <ChevronRight className="w-4 h-4 ml-auto" />}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'portfolios' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Portfolios</h3>
                      <p className="text-slate-500 dark:text-slate-400 mt-1">Create, edit or delete your investment portfolios.</p>
                    </div>
                    <Button onClick={() => setIsAddPortfolioOpen(true)} className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      New Portfolio
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {portfolios.map((portfolio) => (
                      <Card key={portfolio.id} className="flex items-center justify-between p-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
                            <Wallet className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white">{portfolio.name}</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{portfolio.description || 'No description'}</p>
                            {portfolio.monthlyGoal && (
                              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                                Goal: {formatCurrency(portfolio.monthlyGoal)} / month
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="danger" 
                            size="icon"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete "${portfolio.name}"? All assets inside will be lost.`)) {
                                onDeletePortfolio(portfolio.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}

                    {portfolios.length === 0 && (
                      <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 border-dashed">
                        <Wallet className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">No portfolios yet</h4>
                        <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first portfolio to start tracking assets.</p>
                        <Button onClick={() => setIsAddPortfolioOpen(true)}>
                          Create Portfolio
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab !== 'portfolios' && (
                <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-200 dark:border-slate-800">
                  <SettingsIcon className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Coming Soon</h3>
                  <p className="text-slate-500 dark:text-slate-400">This settings tab is under development.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AddPortfolioModal 
        isOpen={isAddPortfolioOpen} 
        onClose={() => setIsAddPortfolioOpen(false)} 
        onAdd={onAddPortfolio} 
      />
    </div>
  );
}
