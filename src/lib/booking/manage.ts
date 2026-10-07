import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const CHANGE_CUTOFF_HOURS = 2;

export function hashManageToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getBookingByRawToken(rawToken: string) {
  const tokenHash = hashManageToken(rawToken);
  const db = getDb();
  return db.select().from(bookings).where(eq(bookings.manage_token_hash, tokenHash)).get();
}

export function isPastChangeCutoff(startsAtIso: string): boolean {
  const startDt = DateTime.fromISO(startsAtIso);
  const cutoffTime = DateTime.now().plus({ hours: CHANGE_CUTOFF_HOURS });
  return startDt < cutoffTime;
}
