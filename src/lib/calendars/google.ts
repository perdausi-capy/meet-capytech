import { TimeRange } from '@/lib/slots/types';
import { logger } from '@/lib/logger';

interface CacheEntry {
  fetchedAt: number;
  ranges: TimeRange[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

export async function fetchGoogleFreeBusy(
  accessToken: string,
  calendarIds: string[],
  fromDate: Date,
  toDate: Date,
): Promise<TimeRange[]> {
  if (process.env.MOCK_CALENDAR === '1') {
    return [
      {
        start: new Date(`${fromDate.toISOString().slice(0, 10)}T10:00:00Z`),
        end: new Date(`${fromDate.toISOString().slice(0, 10)}T11:00:00Z`),
      },
    ];
  }

  if (!calendarIds || calendarIds.length === 0 || !accessToken) {
    return [];
  }

  const cacheKey = `${calendarIds.slice().sort().join(',')}_${fromDate.toISOString()}_${toDate.toISOString()}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.ranges;
  }

  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: fromDate.toISOString(),
        timeMax: toDate.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Google FreeBusy API error: ${response.status}`);
    }

    const data = await response.json();
    const ranges: TimeRange[] = [];

    if (data.calendars) {
      for (const [calId, calData] of Object.entries(data.calendars)) {
        if ((calData as any).errors) {
          throw new Error(`Google FreeBusy API returned errors for calendar: ${calId}`);
        }
        const busyList = (calData as any).busy || [];
        for (const block of busyList) {
          ranges.push({
            start: new Date(block.start),
            end: new Date(block.end),
          });
        }
      }
    }

    cache.set(cacheKey, { fetchedAt: now, ranges });
    return ranges;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Google FreeBusy data');
    throw err; // Fail closed
  }
}
