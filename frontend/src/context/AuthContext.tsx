import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { api, getStoredUser, setAuthTokens, setStoredUser, clearAuth } from '../api/client';

type User = { id: string; email: string; role: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    if (getStoredUser() && !user) setUser(getStoredUser());
    setLoading(false);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>('/auth/login', { email, password });
    setAuthTokens(res.data.accessToken, res.data.refreshToken);
    setStoredUser(res.data.user);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await api.post('/auth/register', { email, password });
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refreshToken');
    if (refresh) {
      try {
        await api.post('/auth/logout', { refreshToken: refresh });
      } catch {
        /* ignore */
      }
    }
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
