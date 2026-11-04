import type { ReactNode } from 'react';

/*
 * Small shared UI primitives. Everything is plain JSX + classes from styles.css:
 * no inline styles, no runtime <style> injection, icons are inline SVG (CSP: style-src 'self').
 */

export type IconName =
  | 'alert'
  | 'arrow-right'
  | 'check'
  | 'check-circle'
  | 'chevron-left'
  | 'chevron-right'
  | 'clock'
  | 'file'
  | 'filter'
  | 'inbox'
  | 'info'
  | 'lock'
  | 'logout'
  | 'mail'
  | 'refresh'
  | 'shield'
  | 'sparkles'
  | 'user'
  | 'warning'
  | 'x-circle';

const PATHS: Record<IconName, ReactNode> = {
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.5h.01" />
    </>
  ),
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.75 2.75L16 10" />
    </>
  ),
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />,
  inbox: (
    <>
      <path d="M4 13l2.5-7.5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 1.5L20 13" />
      <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-5l-1 2h-4l-1-2z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.7-4.4L4 8" />
      <path d="M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.3L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The product mark: a stacked-inbox glyph. Decorative; the visible text names the product. */
export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="logo-mark-bg" />
      <path
        d="M8 17.5l2.2-6.2A2 2 0 0 1 12.1 10h7.8a2 2 0 0 1 1.9 1.3l2.2 6.2v4.5a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2zM8 17.5h4.5l1.2 2.2h4.6l1.2-2.2H24"
        className="logo-mark-fg"
      />
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={className ? `spinner ${className}` : 'spinner'} aria-hidden="true" />;
}

type Tone = 'info' | 'success' | 'warn' | 'error';
const TONE_ICON: Record<Tone, IconName> = { info: 'info', success: 'check-circle', warn: 'warning', error: 'alert' };

export function Alert({
  tone,
  title,
  children,
  role,
  action,
  icon,
  className,
}: {
  tone: Tone;
  title?: ReactNode;
  children?: ReactNode;
  role?: 'alert' | 'status';
  action?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={`alert alert-${tone}${className ? ` ${className}` : ''}`} role={role}>
      <Icon name={icon ?? TONE_ICON[tone]} className="alert-icon" />
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        {children}
      </div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`state state-loading${className ? ` ${className}` : ''}`} role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state state-empty">
      <span className="state-icon">
        <Icon name={icon} />
      </span>
      <p className="state-title">{title}</p>
      {children && <div className="state-text">{children}</div>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-header-desc">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

/** Only these values ever become a brand-* class name; anything else gets the neutral theme. */
const BRAND_KEYS = ['ipstudios', 'drvet', 'space42arena', 'jazzbar', 'menalead'] as const;
export function brandClass(key: string | undefined): string {
  return key && (BRAND_KEYS as readonly string[]).includes(key) ? `brand-${key}` : 'brand-none';
}

/** Two-letter monogram from a brand name, e.g. "Space42 Arena" -> "SA". */
export function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}
