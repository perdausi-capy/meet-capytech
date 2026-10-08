'use client';

import { useCallback, useEffect, useState } from 'react';

export interface Slot {
  startsAt: string;
  endsAt: string;
}

/** Slots grouped by the guest's local date (YYYY-MM-DD). Dates without slots are absent. */
export type DaySlots = Record<string, Slot[]>;

interface CacheEntry {
  fetchedAt: number;
  days: DaySlots;
}

// Short-lived so a guest flipping between months doesn't refetch, but slots don't go stale.
const CACHE_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();
// Requests in flight, shared so a preload and a real request never fetch the same month twice.
const inflight = new Map<string, Promise<DaySlots>>();

function cached(type: string, month: string, tz: string): DaySlots | null {
  const hit = cache.get(`${type}|${month}|${tz}`);
  return hit && Date.now() - hit.fetchedAt < CACHE_MS ? hit.days : null;
}

function fetchMonth(type: string, month: string, tz: string): Promise<DaySlots> {
  const key = `${type}|${month}|${tz}`;
  const hit = cached(type, month, tz);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(key);
  if (pending) return pending;

  const params = new URLSearchParams({ type, month, tz });
  const request = fetch(`/api/availability?${params}`).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to load availability');
    }
    const data: { days: DaySlots } = await res.json();
    cache.set(key, { fetchedAt: Date.now(), days: data.days });
    return data.days;
  });
  inflight.set(key, request);
  request.finally(() => inflight.delete(key)).catch(() => {});
  return request;
}

/** `month` is YYYY-MM in the guest's time zone. Pass null for `type` to skip fetching. */
export function useMonthAvailability(type: string | null, month: string, tz: string) {
  const [days, setDays] = useState<DaySlots>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!type) return;
    // Cached months (e.g. another meeting type preloaded) show instantly, with no loading flash.
    const hit = cached(type, month, tz);
    if (hit) {
      setDays(hit);
      setError('');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    fetchMonth(type, month, tz)
      .then((d) => active && setDays(d))
      .catch((e: Error) => {
        if (!active) return;
        setDays({});
        setError(e.message);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [type, month, tz, version]);

  /** Drops the cached month and fetches it again (e.g. after a slot was taken). */
  const refresh = useCallback(() => {
    if (type) cache.delete(`${type}|${month}|${tz}`);
    setVersion((v) => v + 1);
  }, [type, month, tz]);

  return { days, loading, error, refresh };
}

/** Warms the cache so switching to this type/month later is instant. Errors are ignored. */
export function prefetchMonth(type: string, month: string, tz: string) {
  fetchMonth(type, month, tz).catch(() => {});
}

/** Today's month (YYYY-MM) in a time zone. */
export function currentMonth(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' })
      .format(new Date())
      .slice(0, 7);
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}
