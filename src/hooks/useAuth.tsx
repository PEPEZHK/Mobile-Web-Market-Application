import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";
import { getDatabase, saveDatabase } from "@/lib/db";
import { verifyPassword, hashPassword, AuthUser } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (nickname: string, password: string, remember: boolean) => Promise<boolean>;
  register: (nickname: string, password: string, remember: boolean) => Promise<boolean>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "offline-stock-auth-user";
const SESSION_STORAGE_KEY = "offline-stock-auth-session";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY) ?? sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AuthUser;
        setUser(parsed);
      } catch (err) {
        console.error("Failed to parse stored auth user", err);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const persistUser = useCallback((authUser: AuthUser, remember: boolean) => {
    const serialized = JSON.stringify(authUser);
    if (remember) {
      localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  const login = useCallback(async (nickname: string, password: string, remember: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const db = getDatabase();
      const result = db.exec(
        "SELECT id, nickname, password FROM users WHERE nickname = ? LIMIT 1",
        [nickname.trim()]
      );

      const row = result[0]?.values?.[0];

      if (!row) {
        setError("User not found");
        setLoading(false);
        return false;
      }

      const [, nicknameValue, passwordHash] = row as [number, string, string];
      const userId = row[0] as number;

      if (!verifyPassword(password, passwordHash as string)) {
        const matchesLegacyPassword = password === (passwordHash as string);
        if (matchesLegacyPassword) {
          const newHash = hashPassword(password);
          db.run("UPDATE users SET password = ? WHERE id = ?", [newHash, userId]);
          saveDatabase();
          const authUser: AuthUser = { id: userId, nickname: nicknameValue as string };
          persistUser(authUser, remember);
          setUser(authUser);
          setLoading(false);
          return true;
        }

        setError("Invalid credentials");
        setLoading(false);
        return false;
      }

      const authUser: AuthUser = { id: userId, nickname: nicknameValue as string };
      persistUser(authUser, remember);
      setUser(authUser);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Failed to login", err);
      setError("Unexpected error during login");
      setLoading(false);
      return false;
    }
  }, [persistUser]);

  const register = useCallback(async (nickname: string, password: string, remember: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const trimmedNickname = nickname.trim();
      if (!trimmedNickname || !password) {
        setError("Nickname and password are required");
        setLoading(false);
        return false;
      }

      const db = getDatabase();
      const existing = db.exec(
        "SELECT id FROM users WHERE LOWER(nickname) = LOWER(?) LIMIT 1",
        [trimmedNickname]
      );

      if (existing[0]?.values?.length) {
        setError("Nickname is already taken");
        setLoading(false);
        return false;
      }

      const passwordHash = hashPassword(password);
      db.run("INSERT INTO users (nickname, password) VALUES (?, ?)", [trimmedNickname, passwordHash]);

      const result = db.exec(
        "SELECT id, nickname FROM users WHERE nickname = ? ORDER BY id DESC LIMIT 1",
        [trimmedNickname]
      );

      const newUserRow = result[0]?.values?.[0];

      if (!newUserRow) {
        setError("Failed to create user");
        setLoading(false);
        return false;
      }

      const authUser: AuthUser = {
        id: newUserRow[0] as number,
        nickname: newUserRow[1] as string,
      };

      saveDatabase();
      persistUser(authUser, remember);
      setUser(authUser);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Failed to register", err);
      setError("Unexpected error during registration");
      setLoading(false);
      return false;
    }
  }, [persistUser]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, error }),
    [user, loading, login, register, logout, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
