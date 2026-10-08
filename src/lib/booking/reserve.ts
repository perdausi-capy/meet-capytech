import { DateTime } from 'luxon';
import { and, eq, gt, gte, lt, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';

export class SlotTakenError extends Error {
  constructor(message = 'This time slot is no longer available. Please select another time.') {
    super(message);
    this.name = 'SlotTakenError';
  }
}

/** Daily caps re-checked inside the reservation transaction (the slot list can be stale). */
export interface DayLimits {
  /** Host-calendar day bounds of the booking, ISO UTC. */
  dayStartIso: string;
  dayEndIso: string;
  maxPerDay?: number | null;
  typeMaxPerDay?: number | null;
  /** Not counted (the guest's current booking while they reschedule within the same day). */
  excludeBookingId?: string;
}

/** Day bounds (ISO UTC) of the host-calendar day a slot starts on. */
export function hostDayBounds(startIso: string, timezone: string) {
  const day = DateTime.fromISO(startIso, { zone: timezone }).startOf('day');
  return {
    dayStartIso: day.toUTC().toISO() as string,
    dayEndIso: day.plus({ days: 1 }).toUTC().toISO() as string,
  };
}

/**
 * Atomically claims a time range by inserting a `pending` booking. The IMMEDIATE transaction
 * serialises writers, so two requests for overlapping ranges can never both succeed.
 */
export function reservePendingBooking(
  values: typeof bookings.$inferInsert,
  limits?: DayLimits,
): void {
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

        if (limits && (limits.maxPerDay || limits.typeMaxPerDay)) {
          const sameDay = tx
            .select({ id: bookings.id, type_slug: bookings.type_slug })
            .from(bookings)
            .where(
              and(
                or(eq(bookings.status, 'pending'), eq(bookings.status, 'confirmed')),
                gte(bookings.starts_at, limits.dayStartIso),
                lt(bookings.starts_at, limits.dayEndIso),
              ),
            )
            .all()
            .filter((b) => b.id !== limits.excludeBookingId);
          const full = 'That day is now fully booked. Please pick another day.';
          if (limits.maxPerDay && sameDay.length >= limits.maxPerDay) {
            throw new SlotTakenError(full);
          }
          if (
            limits.typeMaxPerDay &&
            sameDay.filter((b) => b.type_slug === values.type_slug).length >= limits.typeMaxPerDay
          ) {
            throw new SlotTakenError(full);
          }
        }

        tx.insert(bookings)
          .values({ ...values, status: 'pending' })
          .run();
      },
      { behavior: 'immediate' },
    );
  } catch (err: any) {
    if (err instanceof SlotTakenError) throw err;
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new SlotTakenError();
    throw err;
  }
}

/** The host-calendar date (e.g. Europe/London) a slot falls on, which is what the slot engine expects. */
export function hostDateForSlot(startIso: string, timezone: string): string | null {
  return DateTime.fromISO(startIso, { zone: timezone }).toISODate();
}
