'use client';

import React, { useEffect, useState } from 'react';
import { DayPicker } from '@/components/DayPicker';
import { SlotList } from '@/components/SlotList';
import { ThemeToggle } from '@/components/ThemeToggle';
import dynamic from 'next/dynamic';
const Canvas3D = dynamic(() => import('@/components/Canvas3D').then((m) => m.Canvas3D), {
  ssr: false,
});
import { cn } from '@/lib/utils';
import { usePublicConfig } from '@/lib/use-public-config';
import {
  Calendar,
  Clock,
  User,
  Mail,
  FileText,
  Video,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface Booking {
  id: string;
  name: string;
  email: string;
  typeSlug?: string;
  meetingType?: string;
  type?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  startsAt?: string;
  endsAt?: string;
  notes?: string;
  status: 'confirmed' | 'cancelled' | 'rescheduled';
  meetLink?: string;
}

export default function ManagePage({ params }: { params: any }) {
  const [token, setToken] = useState<string>('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Mode: 'view' | 'reschedule' | 'cancel'
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view');

  // Reschedule state
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleTime, setRescheduleTime] = useState<string | undefined>(undefined);

  // Submitting states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [timezone, setTimezone] = useState('Europe/London');
  const { config } = usePublicConfig();
  const hostTimezone = config?.timezone || 'Europe/London';

  useEffect(() => {
    if (!params) return;
    Promise.resolve(params).then((p) => {
      if (p && p.token) {
        setToken(p.token);
      }
    });
  }, [params]);

  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London');
    } catch {
      setTimezone('Europe/London');
    }
  }, []);

  const fetchBooking = async (currentToken: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/manage/${currentToken}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'INVALID OR EXPIRED MANAGEMENT TOKEN');
      }

      const b = data.booking || (data.id ? data : null);
      if (!b) {
        throw new Error('NO BOOKING RECORD FOUND FOR THIS TOKEN.');
      }

      setBooking(b);
    } catch (err: any) {
      setError(err.message || 'FAILED TO LOAD BOOKING');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchBooking(token);
    }
  }, [token]);

  const rescheduleDateStr = rescheduleDate
    ? `${rescheduleDate.getFullYear()}-${String(rescheduleDate.getMonth() + 1).padStart(2, '0')}-${String(rescheduleDate.getDate()).padStart(2, '0')}`
    : '';

  const handleCancel = async () => {
    if (!token) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      const res = await fetch(`/api/manage/${token}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'CANCELLATION FAILED');
      }
      setActionSuccess('RESERVATION CANCELLED SUCCESSFULLY.');
      setMode('view');
      fetchBooking(token);
    } catch (err: any) {
      setActionError(err.message || 'CANCELLATION FAILED');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReschedule = async () => {
    if (!token || !rescheduleDateStr || !rescheduleTime) return;

    setIsSubmitting(true);
    setActionError('');
    try {
      const res = await fetch(`/api/manage/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: rescheduleDateStr,
          startTime: rescheduleTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'RESCHEDULE FAILED');
      }
      setActionSuccess(
        data.warning
          ? `RESERVATION RESCHEDULED. ${String(data.warning).toUpperCase()}`
          : 'RESERVATION RESCHEDULED SUCCESSFULLY.',
      );
      setMode('view');
      setRescheduleDate(undefined);
      setRescheduleTime(undefined);
      // The old link now points at the superseded booking; move to the new one.
      if (data.manageToken) {
        window.history.replaceState(null, '', `/manage/${data.manageToken}`);
        setToken(data.manageToken);
      } else {
        fetchBooking(token);
      }
    } catch (err: any) {
      setActionError(err.message || 'RESCHEDULE FAILED');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resilient Extractors
  const getMeetingTypeSlug = (b: Booking | null): string => {
    return b?.typeSlug || b?.meetingType || b?.type || '';
  };

  const meetingTypeLabel = (b: Booking | null): string => {
    const slug = getMeetingTypeSlug(b);
    const meta = config?.meetingTypes.find((t) => t.slug === slug);
    return meta ? `${meta.name} (${meta.durationMinutes} MIN)` : slug || '--';
  };

  const getValidDate = (b: Booking | null, key: 'start' | 'end'): Date | null => {
    if (!b) return null;
    const candidate = key === 'start' ? b.startTime || b.startsAt || b.date : b.endTime || b.endsAt;

    if (!candidate) return null;

    const directDate = new Date(candidate);
    if (!isNaN(directDate.getTime())) return directDate;

    if (b.date && typeof candidate === 'string') {
      const timePart = candidate.includes('T') ? candidate.split('T')[1] : candidate;
      const combined = new Date(`${b.date}T${timePart}`);
      if (!isNaN(combined.getTime())) return combined;
    }

    return null;
  };

  const formatDate = (b: Booking | null) => {
    const d = getValidDate(b, 'start');
    if (!d) return '--';
    return d.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (b: Booking | null, key: 'start' | 'end') => {
    const d = getValidDate(b, key);
    if (!d) return '--';
    return d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex flex-col justify-between p-4 md:p-12 transition-colors duration-200 overflow-hidden">
      {/* Ambient 3D WebGL Mesh Layer */}
      <Canvas3D />

      {/* Header Bar */}
      <header className="relative z-10 flex justify-between items-center pb-6 hairline-b font-mono-spec text-xs tracking-widest uppercase mb-8 backdrop-blur-sm bg-[var(--bg)]/80">
        <div className="flex items-center gap-3">
          <span className="font-black text-[var(--text-primary)]">
            CAPYTECH UK / MANAGE-RESERVATION
          </span>
          <span className="hidden md:flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded border hairline-border text-[var(--text-muted)] font-bold">
            <Sparkles className="w-3 h-3 text-blue-500" /> SELF-SERVICE PORTAL
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--text-muted)] font-extrabold hidden sm:inline">
            HOST: JASON
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Layout */}
      <main className="relative z-10 max-w-5xl mx-auto w-full flex-1 space-y-8">
        {loading && (
          <div className="hairline-border p-12 bg-[var(--surface)]/90 backdrop-blur-md text-center font-mono-spec text-xs tracking-widest text-[var(--text-muted)] font-bold uppercase shadow-xl">
            FETCHING RESERVATION DATA...
          </div>
        )}

        {!loading && error && (
          <div className="hairline-border border-red-600 bg-red-50 dark:bg-red-950/40 p-8 text-center space-y-4 shadow-xl">
            <XCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h2 className="text-xl font-black text-red-700 dark:text-red-300 font-mono-spec uppercase">
              {error}
            </h2>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 font-mono-spec font-medium">
              Check that your management token link matches the URL from your email invitation.
            </p>
          </div>
        )}

        {!loading && !error && !booking && (
          <div className="hairline-border p-12 bg-[var(--surface)]/90 backdrop-blur-md text-center font-mono-spec text-xs tracking-widest text-[var(--text-muted)] font-bold uppercase shadow-xl">
            NO RESERVATION RECORD FOUND.
          </div>
        )}

        {!loading && !error && booking && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12 items-start">
            {/* Left Column: Spec Summary Card */}
            <div className="lg:col-span-1 hairline-border p-6 sm:p-8 bg-[var(--surface)]/90 backdrop-blur-md space-y-6 shadow-xl sticky top-8">
              <div className="flex items-center justify-between pb-3 hairline-b">
                <span className="font-mono-spec text-[10px] tracking-widest text-[var(--text-muted)] font-black uppercase">
                  STATUS
                </span>
                <span
                  className={cn(
                    'px-3 py-1 font-mono-spec text-[10px] tracking-widest font-black uppercase rounded-md',
                    booking.status === 'confirmed' &&
                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
                    booking.status === 'cancelled' &&
                      'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800',
                    booking.status === 'rescheduled' &&
                      'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
                  )}
                >
                  [{booking.status.toUpperCase()}]
                </span>
              </div>

              <div className="space-y-4 font-mono-spec text-xs tracking-wider uppercase">
                <div>
                  <span className="text-[var(--text-muted)] text-[10px] font-extrabold block mb-0.5">
                    GUEST NAME
                  </span>
                  <span className="font-black text-[var(--text-primary)] text-sm">
                    {booking.name}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] text-[10px] font-extrabold block mb-0.5">
                    EMAIL ADDRESS
                  </span>
                  <span className="font-black text-[var(--text-primary)] text-xs break-all">
                    {booking.email}
                  </span>
                </div>

                <div className="pt-2 hairline-t">
                  <span className="text-[var(--text-muted)] text-[10px] font-extrabold block mb-0.5">
                    MEETING TYPE
                  </span>
                  <span className="font-black text-blue-600 dark:text-blue-400">
                    {meetingTypeLabel(booking).toUpperCase()}
                  </span>
                </div>

                <div className="pt-2 hairline-t">
                  <span className="text-[var(--text-muted)] text-[10px] font-extrabold block mb-0.5">
                    DATE & TIME
                  </span>
                  <span className="font-black text-[var(--text-primary)] block">
                    {formatDate(booking)}
                  </span>
                  <span className="font-black text-blue-600 dark:text-blue-400 text-sm block mt-0.5">
                    {formatTime(booking, 'start')} - {formatTime(booking, 'end')}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                    ({timezone})
                  </span>
                </div>

                {booking.notes && (
                  <div className="pt-2 hairline-t">
                    <span className="text-[var(--text-muted)] text-[10px] font-extrabold block mb-0.5">
                      NOTES
                    </span>
                    <p className="font-semibold text-[var(--text-secondary)] normal-case text-xs leading-relaxed">
                      {booking.notes}
                    </p>
                  </div>
                )}
              </div>

              {booking.meetLink && booking.status === 'confirmed' && (
                <div className="pt-4 hairline-t">
                  <a
                    href={booking.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-mono-spec text-xs font-black tracking-widest uppercase flex items-center justify-center gap-2 transition-colors shadow-md rounded-lg"
                  >
                    <span>JOIN GOOGLE MEET</span>
                    <Video className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            {/* Right Column: Dynamic Action Panel */}
            <div className="lg:col-span-2 hairline-border p-6 sm:p-8 bg-[var(--bg)]/90 backdrop-blur-md space-y-8 shadow-xl">
              {actionSuccess && (
                <div className="p-4 hairline-border border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 font-mono-spec text-xs tracking-widest uppercase font-black text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {actionError && (
                <div className="p-4 hairline-border border-red-600 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 font-mono-spec text-xs tracking-wider uppercase font-black text-center">
                  {actionError}
                </div>
              )}

              {/* DEFAULT VIEW MODE */}
              {mode === 'view' && (
                <div className="space-y-8">
                  <div>
                    <h1 className="text-3xl font-black text-[var(--text-primary)] mb-2">
                      Manage Booking.
                    </h1>
                    <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
                      You can reschedule your appointment to a new time slot or cancel the
                      reservation.
                    </p>
                  </div>

                  {booking.status === 'confirmed' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reschedule');
                          setActionSuccess('');
                          setActionError('');
                        }}
                        className="p-5 border hairline-border bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] font-mono-spec text-xs font-black tracking-widest uppercase text-left transition-all cursor-pointer flex flex-col justify-between h-32 rounded-lg group"
                      >
                        <div className="flex justify-between items-center">
                          <RefreshCw className="w-5 h-5 text-blue-600" />
                          <span className="text-[10px] text-zinc-400">[ACTION]</span>
                        </div>
                        <div>
                          <span className="block font-bold text-sm">RESCHEDULE BOOKING</span>
                          <span className="text-[10px] text-[var(--text-muted)] font-medium normal-case block mt-0.5">
                            Select a new date & time slot
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMode('cancel');
                          setActionSuccess('');
                          setActionError('');
                        }}
                        className="p-5 border hairline-border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 font-mono-spec text-xs font-black tracking-widest uppercase text-left transition-all cursor-pointer flex flex-col justify-between h-32 rounded-lg group"
                      >
                        <div className="flex justify-between items-center">
                          <XCircle className="w-5 h-5 text-red-600" />
                          <span className="text-[10px] text-red-400">[DANGER]</span>
                        </div>
                        <div>
                          <span className="block font-bold text-sm">CANCEL BOOKING</span>
                          <span className="text-[10px] text-red-600/80 dark:text-red-400/80 font-medium normal-case block mt-0.5">
                            Release slot back to availability
                          </span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 hairline-border bg-[var(--surface)] font-mono-spec text-xs text-[var(--text-muted)] font-bold uppercase text-center">
                      THIS RESERVATION IS NO LONGER ACTIVE.
                    </div>
                  )}
                </div>
              )}

              {/* RESCHEDULE MODE */}
              {mode === 'reschedule' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-baseline">
                    <div>
                      <h2 className="text-2xl font-black text-[var(--text-primary)] mb-1">
                        Reschedule Slot.
                      </h2>
                      <div className="p-3 bg-[var(--tip-bg)] border-l-4 border-[var(--tip-border)] text-[var(--tip-text)] font-mono-spec text-xs font-bold tracking-wide">
                        <strong>STEP 1:</strong> Select a new date, then pick an open time slot
                        below.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="px-3 py-1.5 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                  </div>

                  <DayPicker
                    selectedDate={rescheduleDate}
                    maxAdvanceDays={config?.maxAdvanceDays}
                    onSelect={(d) => {
                      setRescheduleDate(d);
                      setRescheduleTime(undefined);
                    }}
                  />

                  {rescheduleDateStr && (
                    <div className="space-y-4 pt-4 hairline-t">
                      <span className="block font-mono-spec text-xs font-black tracking-wider uppercase text-[var(--text-primary)]">
                        AVAILABLE SLOTS FOR {rescheduleDateStr}
                      </span>
                      <SlotList
                        dateStr={rescheduleDateStr}
                        meetingType={getMeetingTypeSlug(booking)}
                        guestTimezone={timezone}
                        hostTimezone={hostTimezone}
                        selectedTime={rescheduleTime}
                        onSelect={(t) => setRescheduleTime(t)}
                      />
                    </div>
                  )}

                  <div className="pt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="px-6 py-3 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      disabled={!rescheduleTime || isSubmitting}
                      onClick={handleReschedule}
                      className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-mono-spec text-xs font-black tracking-widest uppercase disabled:opacity-30 cursor-pointer transition-colors shadow-md rounded-lg"
                    >
                      {isSubmitting ? 'RESCHEDULING...' : 'CONFIRM RESCHEDULE'}
                    </button>
                  </div>
                </div>
              )}

              {/* CANCEL MODE */}
              {mode === 'cancel' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-baseline">
                    <h2 className="text-2xl font-black text-red-600 dark:text-red-400 mb-1">
                      Confirm Cancellation.
                    </h2>
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="px-3 py-1.5 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back
                    </button>
                  </div>

                  <div className="p-4 bg-red-50 dark:bg-red-950/40 border-l-4 border-red-600 text-red-800 dark:text-red-300 font-mono-spec text-xs font-bold leading-relaxed flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>WARNING:</strong> Are you sure you want to cancel this booking? This
                      action will release your reserved slot and notify all attendees.
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setMode('view')}
                      className="px-6 py-3 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer"
                    >
                      KEEP RESERVATION
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleCancel}
                      className="px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white font-mono-spec text-xs font-black tracking-widest uppercase disabled:opacity-30 cursor-pointer transition-colors shadow-md rounded-lg"
                    >
                      {isSubmitting ? 'CANCELING...' : 'YES, CANCEL BOOKING'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 pt-8 hairline-t font-mono-spec text-[10px] tracking-widest uppercase text-[var(--text-muted)] font-black flex justify-between mt-8 backdrop-blur-sm bg-[var(--bg)]/80">
        <span>MEET.CAPYTECH.CO.UK</span>
        <span>UTC TIMESTAMP ENFORCED</span>
      </footer>
    </div>
  );
}
