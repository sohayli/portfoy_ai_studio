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
  Database,
  TrendingUp,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Portfolio, UserProfile } from '../types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatCurrency } from '../lib/utils';
import { AddPortfolioModal } from './modals/AddPortfolioModal';
import { EditPortfolioModal } from './modals/EditPortfolioModal';

interface SettingsProps {
  profile: UserProfile | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  portfolios: Portfolio[];
  onAddPortfolio: (name: string, desc: string, goal: number, birthDate?: string, besEntryDate?: string) => void;
  onUpdatePortfolio: (id: string, updates: Partial<Portfolio>) => void;
  onDeletePortfolio: (id: string) => void;
}

type SettingsTab = 'portfolios' | 'profile' | 'security' | 'notifications' | 'data';

export function Settings({ profile, onUpdateProfile, portfolios, onAddPortfolio, onUpdatePortfolio, onDeletePortfolio }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('portfolios');
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [isEditPortfolioOpen, setIsEditPortfolioOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);

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
                            variant="secondary" 
                            size="icon"
                            onClick={() => {
                              setEditingPortfolio(portfolio);
                              setIsEditPortfolioOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="destructive" 
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

              {activeTab === 'profile' && profile && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">User Profile</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your personal information and BES settings.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <UserIcon className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 dark:text-white">Personal Info</h4>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
                        <input 
                          type="text"
                          value={profile.displayName}
                          onChange={(e) => onUpdateProfile({ displayName: e.target.value })}
                          className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                        <input 
                          type="email"
                          value={profile.email}
                          disabled
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Birth Date</label>
                        <input 
                          type="date"
                          value={profile.birthDate || ''}
                          onChange={(e) => onUpdateProfile({ birthDate: e.target.value })}
                          className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                    </Card>

                    <Card className="p-6 space-y-4 border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/5">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 dark:text-white">BES (Devlet Katkısı) Bilgisi</h4>
                      </div>
                      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Devlet katkısı hakediş hesaplamaları artık her portföy için özel olarak yapılmaktadır. 
                          Portföy ayarlarından doğum tarihi ve sisteme giriş tarihini güncelleyebilirsiniz.
                        </p>
                        <h5 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-4">Vesting Rules (Hakediş)</h5>
                        <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                          <li>• 0-3 years: 0%</li>
                          <li>• 3-6 years: 15%</li>
                          <li>• 6-10 years: 35%</li>
                          <li>• 10+ years: 60%</li>
                          <li>• 10+ years & Age 56+: 100%</li>
                        </ul>
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab !== 'portfolios' && activeTab !== 'profile' && (
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

      <EditPortfolioModal
        isOpen={isEditPortfolioOpen}
        onClose={() => {
          setIsEditPortfolioOpen(false);
          setEditingPortfolio(null);
        }}
        onEdit={onUpdatePortfolio}
        portfolio={editingPortfolio}
      />
    </div>
  );
}
