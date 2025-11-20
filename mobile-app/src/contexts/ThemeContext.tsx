import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  accent: string;
  danger: string;
  surface: string;
  input: string;
  buttonText: string;
}

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ThemeColors;
  isDark: boolean;
}

const STORAGE_KEY = 'offline-stock-theme-mode';

const lightColors: ThemeColors = {
  background: '#f4f5f7',
  card: '#ffffff',
  surface: '#eef1f6',
  text: '#0f172a',
  muted: '#475467',
  border: '#d0d5dd',
  primary: '#0f172a',
  accent: '#2563eb',
  danger: '#b42318',
  input: '#ffffff',
  buttonText: '#ffffff'
};

const darkColors: ThemeColors = {
  background: '#0b1220',
  card: '#111827',
  surface: '#1f2937',
  text: '#f8fafc',
  muted: '#cbd5e1',
  border: '#1f2937',
  primary: '#e2e8f0',
  accent: '#60a5fa',
  danger: '#f87171',
  input: '#0f172a',
  buttonText: '#0f172a'
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        setMode(value);
      }
    });
  }, []);

  const resolvedDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = resolvedDark ? darkColors : lightColors;

  const updateMode = useCallback((next: ThemeMode) => {
    setMode(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode: updateMode,
      colors,
      isDark: resolvedDark
    }),
    [mode, updateMode, colors, resolvedDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return ctx;
}
