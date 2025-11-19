import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';
import { createUser, findUserByNickname, getUserById } from '../storage/database';
import { verifyPassword } from '../lib/auth';

const SESSION_KEY = 'offline-stock-session';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  login: (nickname: string, password: string) => Promise<void>;
  register: (nickname: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        if (!stored) {
          return;
        }
        const parsed = JSON.parse(stored) as { id: number };
        const dbUser = await getUserById(parsed.id);
        if (dbUser && !cancelled) {
          setUser(dbUser);
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (nickname: string, password: string) => {
    const normalized = nickname.trim();
    if (!normalized || !password) {
      throw new Error('Enter both the username and password.');
    }

    const dbUser = await findUserByNickname(normalized);
    if (!dbUser) {
      throw new Error('User not found.');
    }

    if (!verifyPassword(password, dbUser.password)) {
      throw new Error('Incorrect password.');
    }

    setUser(dbUser);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ id: dbUser.id }));
  }, []);

  const register = useCallback(async (nickname: string, password: string) => {
    const normalized = nickname.trim();
    if (!normalized || !password) {
      throw new Error('Username and password are required.');
    }

    await createUser(normalized, password);
    await login(normalized, password);
  }, [login]);

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used inside AuthProvider');
  }
  return context;
}
