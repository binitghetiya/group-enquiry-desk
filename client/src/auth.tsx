import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError, setCsrfToken, type Role, type User } from './api';
import { Alert, LoadingState } from './components/ui';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User; csrfToken: string }>('/api/auth/me')
      .then((r) => {
        setCsrfToken(r.csrfToken);
        setUser(r.user);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User; csrfToken: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
    setCsrfToken(r.csrfToken);
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setCsrfToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** UI guard only - the server enforces the same rules on every API call. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Checking your session…" />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (role === 'admin' && user.role !== 'admin') {
    return (
      <Alert tone="error" icon="lock" title="Administrators only">
        <p>This area is for administrators only.</p>
      </Alert>
    );
  }
  return <>{children}</>;
}

/** Only allow redirecting back to an internal admin path (avoids open redirects). */
export function safeAdminPath(from: unknown): string {
  return typeof from === 'string' && /^\/admin(\/[\w-]*)*$/.test(from) && from !== '/admin/login' ? from : '/admin';
}
