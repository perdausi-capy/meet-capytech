import nodeIcal from 'node-ical';
import { TimeRange } from '@/lib/slots/types';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { busy_cache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// If a feed is unreachable, cached busy ranges are trusted for this long, then we fail closed.
const STALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Each fetch expands the whole booking horizon, so one cache entry answers any day's request.
const FETCH_WINDOW_FUTURE_DAYS = 120;

interface CachedRow {
  range_from: string;
  range_to: string;
  ranges_json: string;
  fetched_at: string;
}

function overlaps(r: TimeRange, fromDate: Date, toDate: Date) {
  return r.end > fromDate && r.start < toDate;
}

/** Returns the cached ranges for [fromDate, toDate], or null if the cache can't answer it. */
function readCache(
  row: CachedRow | undefined,
  fromDate: Date,
  toDate: Date,
  maxAgeMs: number,
): TimeRange[] | null {
  if (!row) return null;
  if (Date.now() - new Date(row.fetched_at).getTime() >= maxAgeMs) return null;
  if (new Date(row.range_from) > fromDate || new Date(row.range_to) < toDate) return null;

  const ranges: { start: string; end: string }[] = JSON.parse(row.ranges_json);
  return ranges
    .map((r) => ({ start: new Date(r.start), end: new Date(r.end) }))
    .filter((r) => overlaps(r, fromDate, toDate));
}

export function parseIcsContent(icsData: string, fromDate: Date, toDate: Date): TimeRange[] {
  // A login page or error body served with HTTP 200 must not be read as "no busy time".
  if (!/BEGIN:VCALENDAR/i.test(icsData)) {
    throw new Error('Response is not an iCalendar feed');
  }

  const busyRanges: TimeRange[] = [];
  const parsed = nodeIcal.sync.parseICS(icsData);

  for (const key of Object.keys(parsed)) {
    const event = parsed[key];
    // Ensure it's a valid event with a start date
    if (!event || event.type !== 'VEVENT' || !event.start) continue;

    // Ignore transparent (Free) or cancelled events
    if (event.transparency === 'TRANSPARENT' || event.status === 'CANCELLED') continue;

    const isAllDay = event.datetype === 'date';
    const exdates = event.exdate
      ? Object.values(event.exdate).map((d: any) => new Date(d).toISOString())
      : [];

    if (event.rrule) {
      try {
        const durationMs = event.end
          ? event.end.getTime() - event.start.getTime()
          : isAllDay
            ? DAY_MS
            : 0;
        const dates = event.rrule.between(fromDate, toDate, true);

        for (const date of dates) {
          if (exdates.includes(date.toISOString())) continue;

          const start = new Date(date);
          let end = new Date(start.getTime() + durationMs);

          if (isAllDay && env.ICS_BLOCK_ALL_DAY) {
            start.setUTCHours(0, 0, 0, 0);
            end = new Date(start.getTime() + DAY_MS);
          }

          if (overlaps({ start, end }, fromDate, toDate)) {
            busyRanges.push({ start, end });
          }
        }
        continue;
      } catch (err) {
        logger.warn({ err, summary: event.summary }, 'Failed to parse RRule for event');
      }
    }

    // Convert proprietary node-ical DateWithTimeZone to standard TS Date
    const start = new Date(event.start as Date);
    let end = event.end ? new Date(event.end as Date) : new Date(start.getTime() + 60 * 60 * 1000);

    if (isAllDay && env.ICS_BLOCK_ALL_DAY) {
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(start.getTime() + DAY_MS);
    }

    if (overlaps({ start, end }, fromDate, toDate)) {
      busyRanges.push({ start, end });
    }
  }

  return busyRanges;
}

export async function fetchIcsFeeds(
  urls: string[],
  fromDate: Date,
  toDate: Date,
): Promise<TimeRange[]> {
  const allRanges: TimeRange[] = [];
  const db = getDb();
  const now = Date.now();

  // Fetch the whole horizon (plus whatever was asked for), then answer from that.
  const windowFrom = new Date(Math.min(fromDate.getTime(), now - DAY_MS));
  const windowTo = new Date(Math.max(toDate.getTime(), now + FETCH_WINDOW_FUTURE_DAYS * DAY_MS));

  for (const url of urls) {
    const cachedRow = db.select().from(busy_cache).where(eq(busy_cache.source, url)).get();

    const fresh = readCache(cachedRow, fromDate, toDate, CACHE_TTL_MS);
    if (fresh) {
      allRanges.push(...fresh);
      continue;
    }

    try {
      const httpUrl = url.replace(/^webcal:/i, 'https:');
      const res = await fetch(httpUrl, {
        headers: { 'User-Agent': 'Meet-Capytech/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const content = await res.text();
      const windowRanges = parseIcsContent(content, windowFrom, windowTo);
      allRanges.push(...windowRanges.filter((r) => overlaps(r, fromDate, toDate)));

      const fetchedAt = new Date().toISOString();
      const row = {
        range_from: windowFrom.toISOString(),
        range_to: windowTo.toISOString(),
        ranges_json: JSON.stringify(windowRanges),
        fetched_at: fetchedAt,
      };
      db.insert(busy_cache)
        .values({ source: url, ...row })
        .onConflictDoUpdate({ target: busy_cache.source, set: row })
        .run();
    } catch (err) {
      logger.error({ url, err }, 'Failed to fetch ICS feed');

      // Tolerate a short outage with recent cached data; otherwise fail closed.
      const stale = readCache(cachedRow, fromDate, toDate, STALE_MAX_AGE_MS);
      if (!stale) throw err;

      logger.warn({ url }, 'Falling back to stale ICS cache');
      allRanges.push(...stale);
    }
  }

  return allRanges;
}
