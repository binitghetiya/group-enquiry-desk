import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api';
import { safeAdminPath, useAuth } from '../../auth';
import { Alert, Icon, LogoMark, Spinner } from '../../components/ui';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Admin & staff sign in - Group Enquiry Desk';
  }, []);

  const target = safeAdminPath((location.state as { from?: unknown } | null)?.from);
  if (user) return <Navigate to={target} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <div className="auth-page">
      <section className="panel auth-card" aria-labelledby="login-title">
        <div className="auth-head">
          <LogoMark />
          <h1 id="login-title">Admin &amp; staff sign in</h1>
          <p className="muted">Sign in to review enquiries for all five brands.</p>
        </div>
        {error && (
          <Alert tone="error" role="alert">
            <p>{error}</p>
          </Alert>
        )}
        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <Spinner />
                <span>Signing in…</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>
        <p className="auth-foot">
          <Icon name="shield" />
          <span>For authorised staff only. Status changes are recorded in an audit log.</span>
        </p>
      </section>
    </div>
  );
}
