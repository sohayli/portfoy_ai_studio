import { useContext } from 'react';
import { 
  TrendingUp, 
  LogOut, 
  User as UserIcon,
  Moon,
  Sun,
  RefreshCw,
  Settings
} from 'lucide-react';
import { auth, signOut, signInWithPopup, googleProvider } from '../lib/firebase';
import { ThemeContext } from '../context';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

interface NavbarProps {
  user: any;
  profile: UserProfile | null;
  currentView: string;
  setView: (v: 'dashboard' | 'assets' | 'settings') => void;
}

export function Navbar({ user, profile, currentView, setView }: NavbarProps) {
  const theme = useContext(ThemeContext);

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">FinTrack</span>
            </div>

            {user && (
              <div className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => setView('dashboard')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    currentView === 'dashboard' 
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setView('assets')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    currentView === 'assets' 
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Assets
                </button>
                <button
                  onClick={() => setView('settings')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    currentView === 'settings' 
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  Settings
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={theme?.toggleTheme}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Toggle Theme"
            >
              {theme?.isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{user.displayName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.baseCurrency || 'USD'}</p>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
