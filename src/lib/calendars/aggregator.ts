import { TimeRange } from '@/lib/slots/types';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { gte, lte, and, or, eq } from 'drizzle-orm';
import { env } from '@/env';
import { fetchIcsFeeds } from './ics';
import { fetchGoogleFreeBusy } from './google';
import { getValidAccessToken } from './google-auth';
import { recordFreeBusySuccess, recordFreeBusyFailure } from './status-tracker';
import { logger } from '@/lib/logger';

export async function getAggregatedBusyRanges(fromDate: Date, toDate: Date): Promise<TimeRange[]> {
  const busyRanges: TimeRange[] = [];

  try {
    const db = getDb();
    const dbBookings = db
      .select()
      .from(bookings)
      .where(
        and(
          or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'pending')),
          gte(bookings.ends_at, fromDate.toISOString()),
          lte(bookings.starts_at, toDate.toISOString()),
        ),
      )
      .all();

    for (const b of dbBookings) {
      busyRanges.push({
        start: new Date(b.starts_at),
        end: new Date(b.ends_at),
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to fetch local database bookings');
  }

  if (env.ICS_FEEDS && env.ICS_FEEDS.length > 0) {
    const icsRanges = await fetchIcsFeeds(env.ICS_FEEDS, fromDate, toDate);
    busyRanges.push(...icsRanges);
  }

  // Google FreeBusy integration - Fails Closed
  const googleAccessToken = await getValidAccessToken();
  const cals = ['primary', ...(env.BUSY_CALENDARS || [])];

  try {
    if (googleAccessToken) {
      const googleRanges = await fetchGoogleFreeBusy(googleAccessToken, cals, fromDate, toDate);
      busyRanges.push(...googleRanges);
      recordFreeBusySuccess();
    } else if (process.env.NODE_ENV === 'production' && process.env.MOCK_CALENDAR !== '1') {
      throw new Error('Google OAuth is not connected. Failing closed to prevent double bookings.');
    }
  } catch (err: any) {
    recordFreeBusyFailure(err.message || 'Failed to fetch Google Calendar');
    throw err;
  }

  return busyRanges;
}
