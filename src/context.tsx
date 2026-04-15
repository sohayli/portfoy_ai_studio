import { createContext } from 'react';
import { UserProfile } from './types';

export const AuthContext = createContext<{
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
} | null>(null);

export const ThemeContext = createContext<{
  isDark: boolean;
  toggleTheme: () => void;
} | null>(null);