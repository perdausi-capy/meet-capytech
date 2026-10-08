import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { availability_overrides } from '@/lib/db/schema';
import type { AvailabilityOverride, WorkingWindow } from '@/lib/slots/types';

function toOverride(row: typeof availability_overrides.$inferSelect): AvailabilityOverride {
  return {
    date: row.date,
    kind: row.kind,
    windows: JSON.parse(row.windows_json) as WorkingWindow[],
    note: row.note,
  };
}

/** Overrides for host-calendar dates in [from, to] (YYYY-MM-DD, inclusive), keyed by date. */
export function getOverrides(from: string, to: string): Map<string, AvailabilityOverride> {
  try {
    const rows = getDb()
      .select()
      .from(availability_overrides)
      .where(and(gte(availability_overrides.date, from), lte(availability_overrides.date, to)))
      .orderBy(asc(availability_overrides.date))
      .all();
    return new Map(rows.map((r) => [r.date, toOverride(r)]));
  } catch {
    return new Map(); // Table not migrated yet.
  }
}

export function listUpcomingOverrides(fromDate: string): AvailabilityOverride[] {
  return getDb()
    .select()
    .from(availability_overrides)
    .where(gte(availability_overrides.date, fromDate))
    .orderBy(asc(availability_overrides.date))
    .all()
    .map(toOverride);
}

export function upsertOverride(o: AvailabilityOverride) {
  const values = {
    kind: o.kind,
    windows_json: JSON.stringify(o.kind === 'custom' ? o.windows : []),
    note: o.note ?? null,
    updated_at: new Date().toISOString(),
  };
  getDb()
    .insert(availability_overrides)
    .values({ date: o.date, ...values })
    .onConflictDoUpdate({ target: availability_overrides.date, set: values })
    .run();
}

export function deleteOverride(date: string) {
  getDb().delete(availability_overrides).where(eq(availability_overrides.date, date)).run();
}
