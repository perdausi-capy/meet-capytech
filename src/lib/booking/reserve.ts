import { DateTime } from 'luxon';
import { and, eq, gt, lt, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';

export class SlotTakenError extends Error {
  constructor() {
    super('This time slot is no longer available. Please select another time.');
    this.name = 'SlotTakenError';
  }
}

/**
 * Atomically claims a time range by inserting a `pending` booking. The IMMEDIATE transaction
 * serialises writers, so two requests for overlapping ranges can never both succeed.
 */
export function reservePendingBooking(values: typeof bookings.$inferInsert): void {
  const db = getDb();
  try {
    db.transaction(
      (tx) => {
        const overlap = tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              or(eq(bookings.status, 'pending'), eq(bookings.status, 'confirmed')),
              lt(bookings.starts_at, values.ends_at),
              gt(bookings.ends_at, values.starts_at),
            ),
          )
          .get();

        if (overlap) throw new SlotTakenError();

        tx.insert(bookings)
          .values({ ...values, status: 'pending' })
          .run();
      },
      { behavior: 'immediate' },
    );
  } catch (err: any) {
    if (err instanceof SlotTakenError || err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new SlotTakenError();
    }
    throw err;
  }
}

/** The host-calendar date (e.g. Europe/London) a slot falls on, which is what the slot engine expects. */
export function hostDateForSlot(startIso: string, timezone: string): string | null {
  return DateTime.fromISO(startIso, { zone: timezone }).toISODate();
}
