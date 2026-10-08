'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock,
  CalendarDays,
  ExternalLink,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  UserRound,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ToastProvider } from './ui';

const NAV: { href: string; label: string; icon: typeof Layers; soon?: boolean }[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/meeting-types', label: 'Meeting types', icon: Layers },
  { href: '/admin/profile', label: 'Profile', icon: UserRound },
  { href: '/admin/availability', label: 'Availability', icon: CalendarClock, soon: true },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarDays, soon: true },
];

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error('That admin token isn’t right.');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="guest-root guest-backdrop flex min-h-screen items-center justify-center p-4 font-sans">
      <form onSubmit={submit} className="panel w-full max-w-md p-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-sm font-bold text-canvas">
          C
        </span>
        <h1 className="mt-6 font-display text-4xl text-ink">
          Admin <em className="text-brand">sign in</em>
        </h1>
        <p className="mt-2 text-sm text-muted">Use the admin token from the server’s settings.</p>
        <label htmlFor="admin-token" className="mt-6 block text-sm font-medium text-ink">
          Admin token
        </label>
        <input
          id="admin-token"
          type="password"
          autoComplete="current-password"
          className="field mt-1.5"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || !token}
          className="btn-primary focus-ring mt-6 w-full"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
      </form>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      {NAV.map(({ href, label, icon: Icon, soon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        if (soon) {
          return (
            <span
              key={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted opacity-60"
            >
              <Icon className="h-4 w-4" /> {label}
              <span className="ml-auto rounded-full border border-hairline px-2 py-0.5 text-[0.65rem] uppercase tracking-wider">
                Soon
              </span>
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-brand-soft text-brand-ink'
                : 'text-ink-2 hover:bg-brand-soft hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
  const [menuOpen, setMenuOpen] = useState(false);

  const check = useCallback(async () => {
    const res = await fetch('/api/admin/status').catch(() => null);
    setState(res?.ok ? 'in' : 'out');
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setState('out');
  };

  if (state === 'checking') {
    return (
      <div className="guest-root flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading" />
      </div>
    );
  }
  if (state === 'out') return <LoginScreen onSuccess={() => void check()} />;

  const footer = (
    <div className="flex flex-col gap-1 border-t border-hairline pt-4">
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className="focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-brand-soft hover:text-ink"
      >
        <ExternalLink className="h-4 w-4" /> View booking page
      </a>
      <button
        type="button"
        onClick={logout}
        className="focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-2 hover:bg-brand-soft hover:text-ink"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-sm font-bold text-canvas">
        C
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-ink">Capytech UK</p>
        <p className="text-xs text-muted">Booking admin</p>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="guest-root min-h-screen font-sans lg:grid lg:grid-cols-[264px_1fr]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen flex-col justify-between border-r border-hairline bg-card-solid px-4 py-6 lg:flex">
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-2">
              {brand}
              <ThemeToggle />
            </div>
            <NavList />
          </div>
          {footer}
        </aside>

        {/* Mobile top bar + drawer */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hairline bg-card-solid px-4 py-3 lg:hidden">
          {brand}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="icon-btn focus-ring"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </header>
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-950/40"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-card-solid px-4 py-6 shadow-2xl">
              <div className="flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  {brand}
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                    className="icon-btn focus-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <NavList onNavigate={() => setMenuOpen(false)} />
              </div>
              {footer}
            </div>
          </div>
        )}

        <main className="min-w-0">
          <div className="px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-10 2xl:px-14">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
