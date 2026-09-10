import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { api, tokenStorage, USER_PROFILE_CHANGED_KEY } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export interface AuthUser {
  id: string;
  businessName: string;
  email: string;
  phone?: string;
  timezone?: string;
  role?: 'admin' | 'client';
  creditBalance?: number;
  billingMode?: 'unknown' | 'airavata_credits' | 'meta_direct';
  metaWabaConnected?: boolean;
  isProtectedMasterAdmin?: boolean;
  active?: boolean;
  permissions?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => Promise<void>;
}

interface SignupData {
  businessName: string;
  email: string;
  password: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const userIdRef = useRef<string | null>(null);

  const setSessionUser = useCallback(async (nextUser: AuthUser | null) => {
    if (userIdRef.current !== nextUser?.id) {
      await queryClient.cancelQueries();
      queryClient.clear();
    }
    userIdRef.current = nextUser?.id ?? null;
    setUser(nextUser);
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const { user: freshUser } = await api.get<{ user: AuthUser }>('/auth/me');
    await setSessionUser(freshUser);
  }, [setSessionUser]);

  // Restore session on mount
  useEffect(() => {
    refreshUser()
      .catch(() => {
        userIdRef.current = null;
        queryClient.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [queryClient, refreshUser]);

  // Billing mode and section permissions can be changed by Master Admin while
  // this account is already open in another tab or window. Keep the session
  // state fresh without requiring a full page reload.
  useEffect(() => {
    const syncVisibleSession = () => {
      if (document.visibilityState !== 'visible' || !tokenStorage.get()) return;
      void refreshUser().catch(() => undefined);
    };
    const handleProfileChanged = (event: StorageEvent) => {
      if (event.key === USER_PROFILE_CHANGED_KEY) syncVisibleSession();
    };
    const interval = window.setInterval(syncVisibleSession, 15_000);

    window.addEventListener('focus', syncVisibleSession);
    window.addEventListener('storage', handleProfileChanged);
    document.addEventListener('visibilitychange', syncVisibleSession);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncVisibleSession);
      window.removeEventListener('storage', handleProfileChanged);
      document.removeEventListener('visibilitychange', syncVisibleSession);
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
    tokenStorage.set(token);
    await setSessionUser(user);
  }, [setSessionUser]);

  const signup = useCallback(async (data: SignupData) => {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/signup', data);
    tokenStorage.set(token);
    await setSessionUser(user);
  }, [setSessionUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      tokenStorage.clear();
      await setSessionUser(null);
    }
  }, [setSessionUser]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
