import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchIcsFeeds } from '@/lib/calendars/ics';
import { getDb } from '@/lib/db';
import { busy_cache } from '@/lib/db/schema';

const FEED_URL = 'https://calendar.example.test/feed.ics';

const feed = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:day-one
DTSTART:20271012T100000Z
DTEND:20271012T110000Z
SUMMARY:Day one
END:VEVENT
BEGIN:VEVENT
UID:day-two
DTSTART:20271013T140000Z
DTEND:20271013T150000Z
SUMMARY:Day two
END:VEVENT
END:VCALENDAR`;

const day = (d: string) => ({
  from: new Date(`${d}T00:00:00Z`),
  to: new Date(`${d}T23:59:59Z`),
});

describe('iCal feed cache', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    getDb().delete(busy_cache).run();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('answers a different day from the cache with that day’s events (no cross-day leakage)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(feed, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const one = day('2027-10-12');
    const first = await fetchIcsFeeds([FEED_URL], one.from, one.to);
    expect(first.map((r) => r.start.toISOString())).toEqual(['2027-10-12T10:00:00.000Z']);

    const two = day('2027-10-13');
    const second = await fetchIcsFeeds([FEED_URL], two.from, two.to);
    expect(second.map((r) => r.start.toISOString())).toEqual(['2027-10-13T14:00:00.000Z']);

    // The second request was served from the cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the feed returns something that is not iCalendar and nothing is cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Sign in</html>', { status: 200 })),
    );

    const one = day('2027-10-12');
    await expect(fetchIcsFeeds([FEED_URL], one.from, one.to)).rejects.toThrow(/not an iCalendar/);
  });

  it('uses recent cached data during a short outage, but fails closed once it is too old', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(feed, { status: 200 })));
    const one = day('2027-10-12');
    await fetchIcsFeeds([FEED_URL], one.from, one.to);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    vi.setSystemTime(new Date('2027-10-01T01:00:00Z')); // cache is stale but recent
    const during = await fetchIcsFeeds([FEED_URL], one.from, one.to);
    expect(during).toHaveLength(1);

    vi.setSystemTime(new Date('2027-10-02T00:00:00Z')); // a day later: too old to trust
    await expect(fetchIcsFeeds([FEED_URL], one.from, one.to)).rejects.toThrow('network down');
  });
});
