import { useContext, useState } from 'react';
import { 
  TrendingUp, 
  LogOut, 
  User as UserIcon,
  Moon,
  Sun,
  RefreshCw,
  Settings,
  Shield,
  Menu,
  X,
  LayoutDashboard,
  Wallet
} from 'lucide-react';
import { signInWithGoogle, signOut } from '../lib/api';
import { ThemeContext } from '../context';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface NavbarProps {
  user: any;
  profile: UserProfile | null;
  currentView: string;
  setView: (v: 'dashboard' | 'assets' | 'settings' | 'bes' | 'passive-income' | 'admin') => void;
}

export function Navbar({ user, profile, currentView, setView }: NavbarProps) {
  const theme = useContext(ThemeContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'assets', label: 'Assets', icon: Wallet },
    { id: 'passive-income', label: 'Pasif Gelir', icon: TrendingUp, color: 'emerald' },
    { id: 'bes', label: 'Devlet Katkısı', icon: Shield, color: 'rose' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Add admin menu for admin/superadmin
  const adminItem = { id: 'admin', label: 'Admin', icon: Shield, color: 'purple' };
  const allNavItems = user && (user.role === 'admin' || user.role === 'superadmin') 
    ? [...navItems, adminItem] 
    : navItems;

  const handleNavClick = (view: any) => {
    setView(view);
    setIsMenuOpen(false);
  };

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleNavClick('dashboard')}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">FinTrack</span>
            </div>

            {user && (
              <div className="hidden md:flex items-center gap-1">
                {allNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id as any)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                      currentView === item.id 
                        ? item.color === 'emerald' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                        : item.color === 'rose' ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                        : item.color === 'purple' ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                        : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    {item.id === 'bes' || item.id === 'passive-income' || item.id === 'admin' ? <item.icon className="w-4 h-4" /> : null}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={theme?.toggleTheme}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Toggle Theme"
            >
              {theme?.isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2 md:gap-3">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user.avatarUrl} alt={user.displayName || user.email} />
                  <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-bold">
                    {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-right hidden lg:block">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{user.user_metadata?.full_name || user.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.baseCurrency || 'USD'}</p>
                </div>
                <button 
                  onClick={() => signOut()}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors hidden sm:block"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
                
                {/* Mobile Menu Toggle */}
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-2 md:hidden text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signInWithGoogle()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-72 bg-white dark:bg-slate-900 shadow-2xl z-50 md:hidden border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-white w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">FinTrack</span>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 space-y-2">
                {allNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id as any)}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                      currentView === item.id 
                        ? item.color === 'emerald' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                        : item.color === 'rose' ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                        : item.color === 'purple' ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                        : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-6">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={user.avatarUrl} alt={user.displayName || user.email} />
                    <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                      {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.user_metadata?.full_name || user.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    signOut();
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}
