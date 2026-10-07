'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Key,
  LogOut,
  Home,
  Users,
  Monitor,
  BarChart2,
  ChevronDown,
  ArrowUpDown,
  ArrowUpRight,
  ExternalLink,
  Video,
  Maximize2,
  X,
  Menu,
  CalendarClock,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import dynamic from 'next/dynamic';

const Canvas3D = dynamic(() => import('@/components/Canvas3D').then((m) => m.Canvas3D), {
  ssr: false,
});

// --- Types ---
interface Booking {
  id: string;
  name: string;
  email: string;
  type?: string;
  type_slug?: string;
  date?: string;
  starts_at?: string;
  ends_at?: string;
  notes?: string;
  status: 'confirmed' | 'cancelled' | 'rescheduled';
  manageToken?: string;
  meetLink?: string;
}

interface SystemStatus {
  status: string;
  googleCalendar: { connected: boolean; email: string | null; tokenExpired: boolean };
  freeBusyService: { lastError: string | null; totalErrorsLogged: number };
}

// --- Helper Functions ---
const getMeetingTypeSlug = (b: Booking): string => {
  const raw = String(b.type_slug || b.type || '').toLowerCase();
  if (raw.includes('intro') || raw.includes('15')) return 'intro';
  return 'tech';
};

const getValidDate = (b: Booking, key: 'start' | 'end'): Date | null => {
  const candidate = key === 'start' ? b.starts_at : b.ends_at;
  if (!candidate) return null;
  const directDate = new Date(candidate);
  if (!isNaN(directDate.getTime())) return directDate;
  return null;
};

const formatDate = (b: Booking) => {
  const d = getValidDate(b, 'start');
  if (!d) return '--';
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (b: Booking, key: 'start' | 'end') => {
  const d = getValidDate(b, key);
  if (!d) return '--';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--surface)]/95 backdrop-blur-md hairline-border p-4 shadow-2xl font-mono-spec">
        <p className="text-[10px] font-black tracking-widest text-[var(--text-primary)] mb-3 pb-2 hairline-b">
          {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <p
            key={index}
            className="text-[10px] font-bold tracking-widest uppercase flex justify-between gap-6 mb-1.5"
            style={{ color: entry.color }}
          >
            <span>{entry.name}:</span>
            <span className="font-black">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const DynamicActivityChart = ({ bookings }: { bookings: Booking[] }) => {
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeAgg, setTimeAgg] = useState<'daily' | 'monthly'>('daily');
  const [metrics, setMetrics] = useState({ confirmed: true, cancelled: true, rescheduled: true });

  useEffect(() => {
    setMounted(true);
  }, []);

  const generateChartData = () => {
    if (!bookings.length) return [];
    let minDate = new Date();
    let maxDate = new Date();
    bookings.forEach((b) => {
      const d = getValidDate(b, 'start');
      if (d) {
        if (d < minDate) minDate = new Date(d);
        if (d > maxDate) maxDate = new Date(d);
      }
    });
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 2);
    const map = new Map();
    let current = new Date(minDate);
    while (current <= maxDate) {
      const key =
        timeAgg === 'daily'
          ? current.toISOString().split('T')[0]
          : `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const label =
        timeAgg === 'daily'
          ? current.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase()
          : current.toLocaleDateString([], { month: 'short', year: 'numeric' }).toUpperCase();
      if (!map.has(key)) map.set(key, { key, label, confirmed: 0, cancelled: 0, rescheduled: 0 });
      current.setDate(current.getDate() + 1);
    }
    bookings.forEach((b) => {
      const d = getValidDate(b, 'start');
      if (!d) return;
      const key =
        timeAgg === 'daily'
          ? d.toISOString().split('T')[0]
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(key)) {
        const entry = map.get(key);
        if (b.status === 'confirmed') entry.confirmed++;
        if (b.status === 'cancelled') entry.cancelled++;
        if (b.status === 'rescheduled') entry.rescheduled++;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  };

  const chartData = generateChartData();

  const toggleMetric = (key: keyof typeof metrics) => {
    setMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderChartControls = (inModal = false) => (
    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 font-mono-spec text-[10px] tracking-widest font-black uppercase">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2 border-r border-[var(--line)] pr-4">
          <button
            onClick={() => setTimeAgg('daily')}
            className={cn(
              'pb-1 border-b-2 transition-colors',
              timeAgg === 'daily'
                ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            DAILY
          </button>
          <button
            onClick={() => setTimeAgg('monthly')}
            className={cn(
              'pb-1 border-b-2 transition-colors',
              timeAgg === 'monthly'
                ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            MONTHLY
          </button>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => toggleMetric('confirmed')}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              metrics.confirmed ? 'text-emerald-500' : 'text-[var(--text-muted)] opacity-50',
            )}
          >
            <span className="w-2 h-2 bg-emerald-500"></span> CONFIRMED
          </button>
          <button
            onClick={() => toggleMetric('rescheduled')}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              metrics.rescheduled ? 'text-blue-500' : 'text-[var(--text-muted)] opacity-50',
            )}
          >
            <span className="w-2 h-2 bg-blue-500"></span> RESCHEDULED
          </button>
          <button
            onClick={() => toggleMetric('cancelled')}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              metrics.cancelled ? 'text-red-500' : 'text-[var(--text-muted)] opacity-50',
            )}
          >
            <span className="w-2 h-2 bg-red-500"></span> CANCELLED
          </button>
        </div>
      </div>
      {!inModal && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" /> EXPAND
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {renderChartControls()}
      <div className="flex-1 w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorConf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorResch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCanc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              tick={{ fontFamily: 'var(--font-mono-spec)', fontWeight: 700 }}
              dy={10}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'var(--line)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            {metrics.cancelled && (
              <Area
                type="monotone"
                dataKey="cancelled"
                name="CANCELLED"
                stroke="#ef4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCanc)"
              />
            )}
            {metrics.rescheduled && (
              <Area
                type="monotone"
                dataKey="rescheduled"
                name="RESCHEDULED"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorResch)"
              />
            )}
            {metrics.confirmed && (
              <Area
                type="monotone"
                dataKey="confirmed"
                name="CONFIRMED"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorConf)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// --- Main Layout ---
export default function AdminDashboard() {
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState('');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<'all' | 'confirmed' | 'rescheduled' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [timezone, setTimezone] = useState('Europe/London');

  useEffect(() => {
    setMounted(true);
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London');
    } catch {}
    checkAuthAndFetch();
  }, []);

  const checkAuthAndFetch = async () => {
    setLoading(true);
    try {
      const statusRes = await fetch('/api/admin/status');
      if (statusRes.status === 401) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      setIsAuthenticated(true);
      const statusData = await statusRes.json();
      setSysStatus(statusData);

      const bookingsRes = await fetch('/api/admin/bookings');
      if (bookingsRes.ok) {
        const bookingsData = await bookingsRes.json();
        setBookings(bookingsData.bookings || []);
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      });
      if (!res.ok) throw new Error('Invalid credentials');
      setIsAuthenticated(true);
      setTokenInput('');
      checkAuthAndFetch();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setBookings([]);
    setSysStatus(null);
  };

  const initiateGoogleConnect = () => {
    // Generate a temporary auth token to initiate OAuth since the route requires Bearer
    // For M6, the server expects the token in the URL for this specific redirect
    window.location.href = `/api/admin/connect?token=${prompt('Please re-enter your Admin Token to authorize Google:')}`;
  };

  if (!mounted) return null;

  if (isAuthenticated === false) {
    return (
      <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-mono-spec flex items-center justify-center p-4">
        <Canvas3D />
        <div className="relative z-10 w-full max-w-md hairline-border p-8 bg-[var(--surface)]/90 backdrop-blur-md shadow-2xl">
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-black mb-2 uppercase tracking-tight">Access Control.</h2>
              <div className="p-3.5 bg-[var(--tip-bg)] border-l-4 border-[var(--tip-border)] text-[var(--tip-text)] text-xs font-bold tracking-wide">
                <strong>SECURE:</strong> Enter your Master Key to authenticate via secure cookie.
              </div>
            </div>
            {error && (
              <div className="p-4 border border-red-600 bg-red-50 text-red-800 text-xs text-center font-bold">
                {error}
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black mb-1">
                  SECRET KEY *
                </label>
                <div className="relative">
                  <Key className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    required
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Enter key..."
                    className="w-full bg-transparent border-b border-[var(--line)] focus:border-blue-500 transition-colors pl-8 pb-1.5 pt-1 text-[10px] tracking-widest outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black tracking-widest uppercase cursor-pointer shadow-md"
              >
                {loading ? 'VERIFYING...' : 'AUTHENTICATE'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const processedBookings = bookings
    .filter((b) => {
      const matchesFilter = filter === 'all' || b.status === filter;
      const searchLower = searchQuery.toLowerCase();
      return (
        matchesFilter &&
        ((b.name || '').toLowerCase().includes(searchLower) ||
          (b.email || '').toLowerCase().includes(searchLower))
      );
    })
    .sort((a, b) => {
      const dateA = getValidDate(a, 'start')?.getTime() || 0;
      const dateB = getValidDate(b, 'start')?.getTime() || 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

  return (
    <div className="relative flex h-screen bg-[var(--bg)] text-[var(--text-primary)] font-mono-spec overflow-hidden uppercase">
      <style
        dangerouslySetInnerHTML={{
          __html: `::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.3);border-radius:3px}*{scrollbar-width:thin}`,
        }}
      />
      <Canvas3D />

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-[50] bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed md:relative z-[60] w-64 h-full hairline-r bg-[var(--surface)]/95 flex flex-col transition-transform duration-300',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="h-20 p-6 hairline-b flex items-center justify-between">
          <span className="font-black">ADMIN</span>
          <X
            className="md:hidden w-5 h-5 cursor-pointer"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-2.5 bg-[var(--surface-hover)] border-l-4 border-[var(--text-primary)] font-bold text-xs tracking-widest"
          >
            <Home className="w-4 h-4" /> DASHBOARD
          </a>
        </nav>
        <div className="p-6 hairline-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-[10px] font-black text-red-500 hover:underline"
          >
            <LogOut className="w-3.5 h-3.5" /> LOGOUT
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="min-h-[5rem] py-4 hairline-b flex items-center justify-between px-6 bg-[var(--surface)]/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <Menu
              className="md:hidden w-5 h-5 cursor-pointer"
              onClick={() => setIsMobileMenuOpen(true)}
            />
            <h2 className="text-xl font-black">COMMAND CENTER</h2>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto space-y-8">
            {/* System Status Row */}
            {sysStatus && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[var(--surface)]/90 backdrop-blur-md hairline-border p-6 shadow-md flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-sm text-[var(--text-muted)] mb-1">
                      GOOGLE WORKSPACE
                    </h3>
                    {sysStatus.googleCalendar.connected ? (
                      <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4" /> CONNECTED AS{' '}
                        {sysStatus.googleCalendar.email}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-500 text-xs font-bold">
                        <AlertTriangle className="w-4 h-4" /> NOT CONNECTED
                      </div>
                    )}
                  </div>
                  {!sysStatus.googleCalendar.connected && (
                    <button
                      onClick={initiateGoogleConnect}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black tracking-widest rounded-md cursor-pointer"
                    >
                      CONNECT OAUTH
                    </button>
                  )}
                </div>
                <div className="bg-[var(--surface)]/90 backdrop-blur-md hairline-border p-6 shadow-md flex flex-col justify-center">
                  <h3 className="font-black text-sm text-[var(--text-muted)] mb-1">
                    FREE/BUSY ENGINE
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {sysStatus.freeBusyService.lastError ? (
                      <span className="text-red-500">
                        ERROR: {sysStatus.freeBusyService.lastError}
                      </span>
                    ) : (
                      <span className="text-emerald-500">HEALTHY / 0 ERRORS</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[var(--surface)]/90 backdrop-blur-md hairline-border shadow-xl">
              <div className="p-4 hairline-b flex justify-between items-center bg-[var(--bg)]/50">
                <h3 className="font-black text-sm tracking-widest text-[var(--text-primary)]">
                  DATABASE LOGS
                </h3>
                <button
                  onClick={checkAuthAndFetch}
                  className="text-[var(--text-muted)] hover:text-blue-500"
                >
                  <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                </button>
              </div>
              <div className="overflow-auto h-[500px]">
                <table className="w-full text-left whitespace-nowrap text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--surface)]/95 backdrop-blur-md">
                    <tr className="hairline-b text-[var(--text-muted)] text-[9px] font-black">
                      <th className="py-4 px-5">ID</th>
                      <th className="py-4 px-5">GUEST</th>
                      <th className="py-4 px-5">TYPE</th>
                      <th className="py-4 px-5">SCHEDULE ({timezone})</th>
                      <th className="py-4 px-5">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {processedBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="py-4 px-5 font-black text-[10px]">
                          #{b.id.substring(0, 8)}
                        </td>
                        <td className="py-4 px-5">
                          <span className="block font-black">{b.name}</span>
                          <span className="block text-[10px] text-[var(--text-muted)]">
                            {b.email}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-bold text-[var(--text-secondary)]">
                          {getMeetingTypeSlug(b) === 'intro' ? 'INTRO' : 'TECH'}
                        </td>
                        <td className="py-4 px-5 font-bold text-[10px]">
                          <span className="block">{formatDate(b)}</span>
                          <span className="text-[var(--text-muted)] block">
                            {formatTime(b, 'start')} - {formatTime(b, 'end')}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-black text-[10px]">
                          <span
                            className={cn(
                              b.status === 'confirmed' && 'text-emerald-500',
                              b.status === 'cancelled' && 'text-red-500',
                              b.status === 'rescheduled' && 'text-blue-500',
                            )}
                          >
                            [{b.status}]
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
