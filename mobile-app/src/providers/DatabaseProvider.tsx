import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initDatabase, resetDatabase } from '../storage/database';

interface DatabaseContextValue {
  ready: boolean;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextValue | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initDatabase().then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setReady(false);
    await initDatabase(true);
    setReady(true);
  };

  const reset = async () => {
    setReady(false);
    await resetDatabase();
    setReady(true);
  };

  const value = useMemo(() => ({ ready, refresh, reset }), [ready]);

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
};

export function useDatabaseProvider() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabaseProvider must be used inside DatabaseProvider');
  }
  return context;
}
