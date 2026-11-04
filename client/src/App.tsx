import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { RequireRole, useAuth } from './auth';
import { EnquiryList } from './pages/admin/EnquiryList';
import { Login } from './pages/admin/Login';
import { SeoHelper } from './pages/admin/SeoHelper';
import { Home } from './pages/Home';
import { PublicForm } from './pages/PublicForm';
import { PublicPage } from './pages/PublicPage';

function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="site-header">
      <Link to="/" className="brand-mark">
        Group Enquiry Desk
      </Link>
      <nav aria-label="Main">
        {user ? (
          <>
            <NavLink to="/admin">Enquiries</NavLink>
            {user.role === 'admin' && <NavLink to="/admin/seo">AI SEO helper</NavLink>}
            <span className="muted user-chip">
              {user.email} ({user.role})
            </span>
            <button type="button" className="btn btn-small" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink to="/admin/login">Staff sign in</NavLink>
        )}
      </nav>
    </header>
  );
}

export function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/enquire/:siteKey" element={<PublicForm />} />
          <Route path="/pages/:pageRef" element={<PublicPage />} />
          <Route path="/admin/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireRole role="staff">
                <EnquiryList />
              </RequireRole>
            }
          />
          <Route
            path="/admin/seo"
            element={
              <RequireRole role="admin">
                <SeoHelper />
              </RequireRole>
            }
          />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
      <footer className="site-footer muted">Assessment prototype · fictional data only · not affiliated with the named businesses</footer>
    </>
  );
}
