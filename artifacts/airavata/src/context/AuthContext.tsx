import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { api, tokenStorage } from '../lib/api';

export interface AuthUser {
  id: string;
  businessName: string;
  email: string;
  phone?: string;
  timezone?: string;
  role?: 'admin' | 'client';
  creditBalance?: number;
  metaWabaConnected?: boolean;
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

  const refreshUser = useCallback(async () => {
    const { user: freshUser } = await api.get<{ user: AuthUser }>('/auth/me');
    setUser(freshUser);
  }, []);

  // Restore session on mount
  useEffect(() => {
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
    tokenStorage.set(token);
    setUser(user);
  }, []);

  const signup = useCallback(async (data: SignupData) => {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/signup', data);
    tokenStorage.set(token);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    tokenStorage.clear();
    setUser(null);
  }, []);

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
