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
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import dynamic from 'next/dynamic';

const Canvas3D = dynamic(() => import('@/components/Canvas3D').then((m) => m.Canvas3D), {
  ssr: false,
});

interface Booking {
  id: string;
  name: string;
  email: string;
  typeSlug?: string;
  type_slug?: string;
  type?: string;
  startsAt?: string;
  endsAt?: string;
  starts_at?: string;
  ends_at?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
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

const getMeetingTypeSlug = (b: Booking): string => {
  const raw = String(b.typeSlug || b.type_slug || b.type || '').toLowerCase();
  if (raw.includes('intro') || raw.includes('15')) return 'intro';
  return 'tech';
};

const getValidDate = (b: Booking, key: 'start' | 'end'): Date | null => {
  const candidate =
    key === 'start'
      ? b.startsAt || b.starts_at || b.startTime || b.date
      : b.endsAt || b.ends_at || b.endTime;
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
  const [timeAgg, setTimeAgg] = useState<'daily' | 'monthly'>('monthly');
  const [metrics, setMetrics] = useState({ confirmed: true, cancelled: true, rescheduled: true });
  const [refDate, setRefDate] = useState(new Date());

  useEffect(() => {
    setMounted(true);
  }, []);

  const shiftDate = (dir: number) => {
    const d = new Date(refDate);
    if (timeAgg === 'daily') d.setDate(d.getDate() + dir);
    else d.setMonth(d.getMonth() + dir);
    setRefDate(d);
  };

  const generateChartData = () => {
    if (!bookings) return [];
    const map = new Map();

    if (timeAgg === 'daily') {
      // Daily: Group by 24 Hours
      for (let i = 0; i < 24; i++) {
        const label = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`;
        map.set(i, { key: i, label, confirmed: 0, cancelled: 0, rescheduled: 0 });
      }

      bookings.forEach((b) => {
        const d = getValidDate(b, 'start');
        if (!d) return;
        if (
          d.getFullYear() === refDate.getFullYear() &&
          d.getMonth() === refDate.getMonth() &&
          d.getDate() === refDate.getDate()
        ) {
          const hr = d.getHours();
          if (map.has(hr)) {
            const entry = map.get(hr);
            if (b.status === 'confirmed') entry.confirmed++;
            if (b.status === 'cancelled') entry.cancelled++;
            if (b.status === 'rescheduled') entry.rescheduled++;
          }
        }
      });
    } else {
      // Monthly: Group by Days in Month
      const year = refDate.getFullYear();
      const month = refDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
        map.set(i, { key: i, label, confirmed: 0, cancelled: 0, rescheduled: 0 });
      }

      bookings.forEach((b) => {
        const d = getValidDate(b, 'start');
        if (!d) return;
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate();
          if (map.has(day)) {
            const entry = map.get(day);
            if (b.status === 'confirmed') entry.confirmed++;
            if (b.status === 'cancelled') entry.cancelled++;
            if (b.status === 'rescheduled') entry.rescheduled++;
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => a.key - b.key);
  };

  const chartData = generateChartData();

  const toggleMetric = (key: keyof typeof metrics) => {
    setMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderChartControls = (inModal = false) => {
    const displayDate =
      timeAgg === 'daily'
        ? refDate
            .toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
            .toUpperCase()
        : refDate.toLocaleDateString([], { month: 'short', year: 'numeric' }).toUpperCase();

    return (
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 font-mono-spec text-[10px] tracking-widest font-black uppercase">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2 border-r border-[var(--line)] pr-4">
            <button
              onClick={() => {
                setTimeAgg('daily');
                setRefDate(new Date());
              }}
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
              onClick={() => {
                setTimeAgg('monthly');
                setRefDate(new Date());
              }}
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

          <div className="flex items-center gap-1 border-r border-[var(--line)] pr-4">
            <button
              onClick={() => shiftDate(-1)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="w-24 text-center text-[var(--text-primary)] font-bold">
              {displayDate}
            </span>
            <button
              onClick={() => shiftDate(1)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
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
  };

  const renderChartArea = () => (
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
          minTickGap={20}
          interval="preserveStartEnd"
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
  );

  return (
    <>
      <div className="flex flex-col h-full w-full">
        {renderChartControls()}
        <div className="flex-1 w-full min-h-[200px]">{renderChartArea()}</div>
      </div>
      {mounted &&
        isExpanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-2xl p-4 sm:p-8"
            onClick={() => setIsExpanded(false)}
          >
            <div
              className="w-full max-w-6xl bg-[var(--surface)]/95 hairline-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 sm:p-8 hairline-b flex justify-between items-center bg-[var(--bg)]/50 shrink-0">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] uppercase font-mono-spec">
                    TELEMETRY
                  </h2>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 border hairline-border hover:bg-[var(--surface-hover)] text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8 overflow-y-auto">
                {renderChartControls(true)}
                <div className="w-full h-[300px] sm:h-[400px] hairline-border bg-[var(--bg)]/50 p-4 sm:p-6 mb-8">
                  {renderChartArea()}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

const DonutChart = ({
  confirmed,
  cancelled,
  rescheduled,
}: {
  confirmed: number;
  cancelled: number;
  rescheduled: number;
}) => {
  const total = confirmed + cancelled + rescheduled || 1;
  const cPct = (confirmed / total) * 100;
  const rPct = (rescheduled / total) * 100;
  const xPct = (cancelled / total) * 100;
  const circumference = 2 * Math.PI * 40;
  const cDash = (cPct / 100) * circumference;
  const rDash = (rPct / 100) * circumference;
  const xDash = (xPct / 100) * circumference;

  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#ef4444"
          strokeWidth="8"
          strokeDasharray={`${xDash} ${circumference}`}
          strokeDashoffset="0"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="8"
          strokeDasharray={`${rDash} ${circumference}`}
          strokeDashoffset={`-${xDash}`}
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#10b981"
          strokeWidth="8"
          strokeDasharray={`${cDash} ${circumference}`}
          strokeDashoffset={`-${xDash + rDash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-mono-spec">
        <span className="text-xl font-black leading-none">
          {total === 1 && confirmed === 0 ? 0 : total}
        </span>
        <span className="text-[8px] text-[var(--text-muted)] tracking-widest mt-1">TOTAL</span>
      </div>
    </div>
  );
};

const GlobalStyles = () => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.3); border-radius: 3px; }
    * { scrollbar-width: thin; scrollbar-color: rgba(128, 128, 128, 0.3) transparent; }
  `,
    }}
  />
);

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
      if (statusRes.status === 401 || statusRes.status === 403) {
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
    const token = prompt('Please re-enter your Admin Token to authorize Google:');
    if (token) window.location.href = `/api/admin/connect?token=${token}`;
  };

  if (!mounted) return null;

  if (isAuthenticated === false) {
    return (
      <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-mono-spec flex items-center justify-center p-4">
        <GlobalStyles />
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

  const upcomingBookings = bookings
    .filter((b) => b.status === 'confirmed' || b.status === 'rescheduled')
    .sort(
      (a, b) =>
        (getValidDate(a, 'start')?.getTime() || 0) - (getValidDate(b, 'start')?.getTime() || 0),
    );
  const activeBookings = bookings.filter((b) => b.status === 'confirmed');
  const cancelledBookings = bookings.filter((b) => b.status === 'cancelled');
  const rescheduledBookings = bookings.filter((b) => b.status === 'rescheduled');

  return (
    <div className="relative flex h-screen bg-[var(--bg)] text-[var(--text-primary)] font-mono-spec overflow-hidden uppercase">
      <GlobalStyles />
      <Canvas3D />

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
            <div className="relative hidden md:flex items-center w-64">
              <Search className="absolute left-0 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="SEARCH DATABASE..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-b border-[var(--line)] focus:border-[var(--text-primary)] transition-colors pl-7 pb-1 text-[10px] tracking-widest outline-none text-[var(--text-primary)]"
              />
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              {/* LEFT COLUMN */}
              <div className="lg:col-span-2 space-y-6 md:space-y-8">
                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
                  <div className="bg-[var(--surface)]/90 backdrop-blur-md p-4 sm:p-5 hairline-border shadow-xl flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] text-[var(--text-muted)] font-black tracking-widest">
                        TOTAL
                      </span>
                      <CalendarDays className="w-4 h-4 text-[var(--text-muted)]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-black mb-1">{bookings.length}</span>
                  </div>
                  <div className="bg-[var(--surface)]/90 backdrop-blur-md p-4 sm:p-5 hairline-border shadow-xl flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] text-[var(--text-muted)] font-black tracking-widest">
                        CONFIRMED
                      </span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-black mb-1">
                      {activeBookings.length}
                    </span>
                  </div>
                  <div className="bg-[var(--surface)]/90 backdrop-blur-md p-4 sm:p-5 hairline-border shadow-xl flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] text-[var(--text-muted)] font-black tracking-widest">
                        RESCHEDULED
                      </span>
                      <CalendarClock className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-black mb-1">
                      {rescheduledBookings.length}
                    </span>
                  </div>
                  <div className="bg-[var(--surface)]/90 backdrop-blur-md p-4 sm:p-5 hairline-border shadow-xl flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] text-[var(--text-muted)] font-black tracking-widest">
                        CANCELLED
                      </span>
                      <XCircle className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-black mb-1">
                      {cancelledBookings.length}
                    </span>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                  <div className="md:col-span-2 bg-[var(--surface)]/90 backdrop-blur-md hairline-border p-4 sm:p-6 shadow-xl flex flex-col">
                    <DynamicActivityChart bookings={bookings} />
                  </div>
                  <div className="md:col-span-1 bg-[var(--surface)]/90 backdrop-blur-md hairline-border p-4 sm:p-6 shadow-xl flex flex-col">
                    <h3 className="font-black text-sm tracking-widest text-[var(--text-primary)] mb-6">
                      STATUS RATIO
                    </h3>
                    <div className="flex-1 flex flex-col sm:flex-row md:flex-col items-center justify-center gap-6">
                      <DonutChart
                        confirmed={activeBookings.length}
                        cancelled={cancelledBookings.length}
                        rescheduled={rescheduledBookings.length}
                      />
                      <div className="space-y-3 font-bold text-[10px] tracking-widest">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500"></span>
                          <span className="text-[var(--text-muted)] w-16">CONF</span>
                          <span>{activeBookings.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-red-500"></span>
                          <span className="text-[var(--text-muted)] w-16">CANC</span>
                          <span>{cancelledBookings.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500"></span>
                          <span className="text-[var(--text-muted)] w-16">RESCH</span>
                          <span>{rescheduledBookings.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Table */}
                <div className="bg-[var(--surface)]/90 backdrop-blur-md hairline-border shadow-xl flex flex-col">
                  <div className="p-4 sm:p-5 hairline-b flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--bg)]/50">
                    <h3 className="font-black text-sm tracking-widest text-[var(--text-primary)]">
                      DATABASE LOGS
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-black tracking-widest">
                      <button
                        onClick={() => setFilter('all')}
                        className={cn(
                          'pb-1 transition-colors',
                          filter === 'all'
                            ? 'text-[var(--text-primary)] border-b border-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        [ALL]
                      </button>
                      <button
                        onClick={() => setFilter('confirmed')}
                        className={cn(
                          'pb-1 transition-colors',
                          filter === 'confirmed'
                            ? 'text-emerald-500 border-b border-emerald-500'
                            : 'text-[var(--text-muted)] hover:text-emerald-500',
                        )}
                      >
                        [CONF]
                      </button>
                      <button
                        onClick={() => setFilter('rescheduled')}
                        className={cn(
                          'pb-1 transition-colors',
                          filter === 'rescheduled'
                            ? 'text-blue-500 border-b border-blue-500'
                            : 'text-[var(--text-muted)] hover:text-blue-500',
                        )}
                      >
                        [RESCH]
                      </button>
                      <button
                        onClick={() => setFilter('cancelled')}
                        className={cn(
                          'pb-1 transition-colors',
                          filter === 'cancelled'
                            ? 'text-red-500 border-b border-red-500'
                            : 'text-[var(--text-muted)] hover:text-red-500',
                        )}
                      >
                        [CANC]
                      </button>
                      <button
                        onClick={checkAuthAndFetch}
                        className="text-[var(--text-muted)] hover:text-blue-500 ml-4"
                      >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto h-[450px] relative">
                    <table className="w-full text-left whitespace-nowrap text-xs min-w-[600px]">
                      <thead className="sticky top-0 z-10 bg-[var(--surface)]/95 backdrop-blur-md">
                        <tr className="hairline-b text-[var(--text-muted)] text-[9px] font-black">
                          <th
                            className="py-4 px-5 cursor-pointer hover:text-[var(--text-primary)]"
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          >
                            ID <ArrowUpDown className="w-3 h-3 inline ml-1" />
                          </th>
                          <th className="py-4 px-5">GUEST / EMAIL</th>
                          <th className="py-4 px-5">TYPE</th>
                          <th className="py-4 px-5">SCHEDULE ({timezone})</th>
                          <th className="py-4 px-5 text-center">STATUS</th>
                          <th className="py-4 px-5 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {processedBookings.map((b) => (
                          <tr
                            key={b.id}
                            onClick={() => setSelectedBooking(b)}
                            className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group"
                          >
                            <td className="py-4 px-5 font-black text-[10px]">
                              #{b.id.substring(0, 8)}
                            </td>
                            <td className="py-4 px-5">
                              <span className="block font-black">{b.name}</span>
                              <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">
                                {b.email}
                              </span>
                            </td>
                            <td className="py-4 px-5 font-bold text-[var(--text-secondary)]">
                              {getMeetingTypeSlug(b) === 'intro' ? 'INTRO (15M)' : 'TECH (30M)'}
                            </td>
                            <td className="py-4 px-5 font-bold text-[10px]">
                              <span className="block">{formatDate(b)}</span>
                              <span className="text-[var(--text-muted)] block mt-0.5">
                                {formatTime(b, 'start')} - {formatTime(b, 'end')}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center font-black text-[10px] tracking-widest">
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
                            <td className="py-4 px-5 text-right">
                              <button className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                                <ArrowUpRight className="w-4 h-4 inline" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="lg:col-span-1 space-y-6 md:space-y-8">
                {/* Upcoming List */}
                <div className="bg-[var(--surface)]/90 backdrop-blur-md hairline-border p-5 sm:p-6 shadow-xl">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-sm tracking-widest text-[var(--text-primary)]">
                      UPCOMING
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {upcomingBookings.length === 0 ? (
                      <div className="text-[10px] font-bold text-[var(--text-muted)] py-4 text-center">
                        NO UPCOMING MEETINGS.
                      </div>
                    ) : (
                      upcomingBookings.slice(0, 5).map((b, i) => (
                        <div
                          key={b.id}
                          className="flex gap-4 relative pb-4 hairline-b last:border-0 last:pb-0 group"
                        >
                          <div className="mt-1 flex-shrink-0">
                            <span
                              className={cn(
                                'w-2 h-2 block',
                                b.status === 'confirmed' ? 'bg-emerald-500' : 'bg-blue-500',
                              )}
                            ></span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-xs font-black truncate pr-2">
                                {getMeetingTypeSlug(b) === 'intro' ? 'INTRO (15M)' : 'TECH (30M)'}
                              </h4>
                              <span
                                className={cn(
                                  'text-[8px] font-black tracking-widest',
                                  b.status === 'confirmed' ? 'text-emerald-500' : 'text-blue-500',
                                )}
                              >
                                [{b.status}]
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-[var(--text-secondary)]">
                              {formatDate(b)}, {formatTime(b, 'start')}
                            </p>
                            <p className="text-[9px] font-bold text-[var(--text-muted)] tracking-widest mt-1 group-hover:text-[var(--text-primary)] transition-colors">
                              GUEST: {b.name}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Row Inspection Modal */}
      {mounted &&
        selectedBooking &&
        createPortal(
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-2xl p-4 sm:p-8"
            onClick={() => setSelectedBooking(null)}
          >
            <div
              className="w-full max-w-3xl bg-[var(--surface)]/95 hairline-border shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 sm:p-8 hairline-b flex justify-between items-center bg-[var(--bg)]/50 shrink-0">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
                    BOOKING #{selectedBooking.id.substring(0, 8)}
                  </h2>
                  <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-bold tracking-widest mt-1">
                    DETAILED RESERVATION INSPECTION
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="p-2 border hairline-border hover:bg-[var(--surface-hover)] text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8 overflow-y-auto space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="space-y-2 lg:col-span-2">
                    <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest block hairline-b pb-2">
                      GUEST INFORMATION
                    </span>
                    <div className="pt-2 flex flex-col gap-1">
                      <span className="font-black text-sm">{selectedBooking.name}</span>
                      <span className="text-xs font-bold text-[var(--text-muted)]">
                        {selectedBooking.email}
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest block hairline-b pb-2 mt-6">
                      GUEST NOTES & CONTEXT
                    </span>
                    <p className="font-semibold text-[var(--text-secondary)] normal-case text-xs leading-relaxed pt-2">
                      {selectedBooking.notes || 'No context notes provided by guest.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest block hairline-b pb-2">
                      SYSTEM IDENTIFIERS
                    </span>
                    <div className="space-y-3 pt-2 text-[10px] tracking-wider uppercase font-bold">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">FULL ID</span>
                        <span className="truncate max-w-[150px]">{selectedBooking.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">MANAGE TOKEN</span>
                        <span className="text-emerald-500">PROTECTED (HASHED)</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="space-y-2 lg:col-span-2">
                    <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest block hairline-b pb-2">
                      SCHEDULE
                    </span>
                    <div className="pt-2 space-y-1">
                      <span className="block font-black text-[var(--text-secondary)]">
                        {getMeetingTypeSlug(selectedBooking) === 'intro'
                          ? 'INTRO (15M)'
                          : 'TECH (30M)'}
                      </span>
                      <span className="block text-[10px] font-bold">
                        {formatDate(selectedBooking)}
                      </span>
                      <span className="text-blue-500 block text-[10px] font-bold">
                        {formatTime(selectedBooking, 'start')} -{' '}
                        {formatTime(selectedBooking, 'end')}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest block hairline-b pb-2">
                      QUICK ACTIONS
                    </span>
                    <div className="pt-2 space-y-3 flex flex-col">
                      {selectedBooking.meetLink ? (
                        <a
                          href={selectedBooking.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-black text-blue-500 hover:underline flex items-center gap-2"
                        >
                          <Video className="w-3.5 h-3.5" /> JOIN GOOGLE MEET
                        </a>
                      ) : (
                        <div className="text-[10px] font-bold text-[var(--text-muted)]">
                          NO VIDEO LINK GENERATED
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
