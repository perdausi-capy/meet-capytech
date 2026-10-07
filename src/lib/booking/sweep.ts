import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const STALE_PENDING_MINUTES = 30;

export function sweepStalePendingBookings() {
  try {
    const db = getDb();
    const staleThreshold = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000).toISOString();

    const result = db
      .delete(bookings)
      .where(
        and(
          eq(bookings.status, 'pending'),
          isNull(bookings.event_id),
          lt(bookings.created_at, staleThreshold),
          lt(bookings.updated_at, staleThreshold),
        ),
      )
      .run();

    if (result.changes > 0) {
      logger.info({ cleared: result.changes }, 'Swept stale pending bookings');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to sweep stale pending bookings');
  }
}
