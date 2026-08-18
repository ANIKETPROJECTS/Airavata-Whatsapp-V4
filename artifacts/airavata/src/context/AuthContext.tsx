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
  creditBalance?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
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

  // Restore session on mount
  useEffect(() => {
    api
      .get<{ user: AuthUser }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

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
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
