import { Link, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { RequireRole, useAuth } from './auth';
import { EmptyState, Icon, LogoMark } from './components/ui';
import { EnquiryList } from './pages/admin/EnquiryList';
import { Login } from './pages/admin/Login';
import { SeoHelper } from './pages/admin/SeoHelper';
import { Home } from './pages/Home';
import { PublicForm } from './pages/PublicForm';
import { PublicPage } from './pages/PublicPage';

function BrandLink() {
  return (
    <Link to="/" className="brand-link">
      <LogoMark />
      <span className="brand-link-text">Group Enquiry Desk</span>
    </Link>
  );
}

function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Skip to content
    </a>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="user-menu">
      <span className="avatar" aria-hidden="true">
        {user.email.slice(0, 1).toUpperCase()}
      </span>
      <span className="user-meta">
        <span className="user-email" title={user.email}>
          {user.email}
        </span>
        <span className="user-role">{user.role === 'admin' ? 'Administrator' : 'Staff'}</span>
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void logout()}>
        <Icon name="logout" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

function PublicHeader() {
  const { user } = useAuth();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <BrandLink />
        <nav aria-label="Main" className="site-nav">
          {user ? (
            <NavLink to="/admin" className="btn btn-secondary btn-sm">
              <Icon name="inbox" />
              <span>Open admin</span>
            </NavLink>
          ) : (
            <NavLink to="/admin/login" className="btn btn-secondary btn-sm">
              <Icon name="lock" />
              <span>Staff sign in</span>
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

function AdminHeader() {
  const { user } = useAuth();
  return (
    <header className="site-header site-header-admin">
      <div className="site-header-inner">
        <div className="admin-brand">
          <BrandLink />
          <span className="env-tag">Staff</span>
        </div>
        {user && (
          <nav aria-label="Main" className="admin-nav">
            <NavLink to="/admin" end className="admin-nav-link">
              <Icon name="inbox" />
              <span>Enquiries</span>
            </NavLink>
            {user.role === 'admin' && (
              <NavLink to="/admin/seo" className="admin-nav-link">
                <Icon name="sparkles" />
                <span>AI SEO helper</span>
              </NavLink>
            )}
          </nav>
        )}
        <UserMenu />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        Assessment prototype · fictional data only · not affiliated with the named businesses
      </div>
    </footer>
  );
}

function PublicLayout() {
  return (
    <div className="app-shell">
      <SkipLink />
      <PublicHeader />
      <main id="main" tabIndex={-1} className="container">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function AdminLayout() {
  return (
    <div className="app-shell app-shell-admin">
      <SkipLink />
      <AdminHeader />
      <main id="main" tabIndex={-1} className="container container-wide">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <div className="panel">
      <EmptyState icon="file" title="Page not found" action={<Link to="/" className="btn btn-primary">Go to the home page</Link>}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/enquire/:siteKey" element={<PublicForm />} />
        <Route path="/pages/:pageRef" element={<PublicPage />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route element={<AdminLayout />}>
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
      </Route>
    </Routes>
  );
}
