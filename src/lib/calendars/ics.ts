import nodeIcal from 'node-ical';
import { TimeRange } from '@/lib/slots/types';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { busy_cache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function parseIcsContent(icsData: string, fromDate: Date, toDate: Date): TimeRange[] {
  const busyRanges: TimeRange[] = [];

  try {
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
              ? 24 * 60 * 60 * 1000
              : 0;
          const dates = event.rrule.between(fromDate, toDate, true);

          for (const date of dates) {
            if (exdates.includes(date.toISOString())) continue;

            const start = new Date(date);
            let end = new Date(start.getTime() + durationMs);

            if (isAllDay && env.ICS_BLOCK_ALL_DAY) {
              start.setUTCHours(0, 0, 0, 0);
              end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
            }

            if (end > fromDate && start < toDate) {
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
      let end = event.end
        ? new Date(event.end as Date)
        : new Date(start.getTime() + 60 * 60 * 1000);

      if (isAllDay && env.ICS_BLOCK_ALL_DAY) {
        start.setUTCHours(0, 0, 0, 0);
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      }

      if (start && end && end > fromDate && start < toDate) {
        busyRanges.push({ start, end });
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to parse ICS feed content');
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

  for (const url of urls) {
    try {
      const cached = db.select().from(busy_cache).where(eq(busy_cache.source, url)).get();

      if (cached && now - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
        const ranges = JSON.parse(cached.ranges_json);
        allRanges.push(
          ...ranges.map((r: any) => ({ start: new Date(r.start), end: new Date(r.end) })),
        );
        continue;
      }

      const httpUrl = url.replace(/^webcal:/i, 'https:');
      const res = await fetch(httpUrl, {
        headers: { 'User-Agent': 'Meet-Capytech/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const content = await res.text();
      const ranges = parseIcsContent(content, fromDate, toDate);
      allRanges.push(...ranges);

      db.insert(busy_cache)
        .values({
          source: url,
          range_from: fromDate.toISOString(),
          range_to: toDate.toISOString(),
          ranges_json: JSON.stringify(ranges),
          fetched_at: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: busy_cache.source,
          set: {
            range_from: fromDate.toISOString(),
            range_to: toDate.toISOString(),
            ranges_json: JSON.stringify(ranges),
            fetched_at: new Date().toISOString(),
          },
        })
        .run();
    } catch (err) {
      logger.error({ url, err }, 'Failed to fetch ICS feed');

      // Fail-open to stale cache if the network goes down
      const stale = db.select().from(busy_cache).where(eq(busy_cache.source, url)).get();
      if (stale) {
        logger.warn({ url }, 'Falling back to stale ICS cache');
        const ranges = JSON.parse(stale.ranges_json);
        allRanges.push(
          ...ranges.map((r: any) => ({ start: new Date(r.start), end: new Date(r.end) })),
        );
      } else {
        throw err; // Fail closed if we have absolutely no data
      }
    }
  }

  return allRanges;
}
