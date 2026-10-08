import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { bookings, meeting_types, settings } from '@/lib/db/schema';
import type { LocationKind, MeetingType } from '@/lib/slots/types';

type Row = typeof meeting_types.$inferSelect;

/** Used to seed the table the first time; matches the original built-in types. */
const SEED_TYPES: MeetingType[] = [
  {
    slug: 'intro',
    name: 'Introductory Call',
    description: 'Quick alignment and introduction.',
    durationMinutes: 15,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 10,
  },
  {
    slug: 'tech',
    name: 'Technical Consultation',
    description: 'Deep dive into architecture or project scope.',
    durationMinutes: 30,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 15,
  },
];

export function toMeetingType(row: Row): MeetingType {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    locationKind: row.location_kind,
    locationDetail: row.location_detail,
    maxPerDay: row.max_per_day,
    isPrivate: row.is_private,
    status: row.status,
    sortOrder: row.sort_order,
  };
}

const LOCATION_LABELS: Record<LocationKind, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  phone: 'Phone call',
  in_person: 'In person',
  custom: 'Custom location',
};

/** Short label for a type's location, e.g. "Google Meet" or the custom text. */
export function locationLabel(type: Pick<MeetingType, 'locationKind' | 'locationDetail'>): string {
  const kind = type.locationKind ?? 'google_meet';
  if (kind === 'custom' && type.locationDetail) return type.locationDetail;
  return LOCATION_LABELS[kind];
}

let seeded = false;

/**
 * The first time types are read, move them into the table: from the old settings JSON (where the
 * CRM API used to store them) or the built-in defaults.
 */
function ensureSeeded() {
  if (seeded) return;
  const db = getDb();
  const count =
    db
      .select({ n: sql<number>`count(*)` })
      .from(meeting_types)
      .get()?.n ?? 0;
  if (count === 0) {
    let source = SEED_TYPES;
    const record = db.select().from(settings).where(eq(settings.key, 'availability')).get();
    if (record) {
      const stored = (JSON.parse(record.value) as { meetingTypes?: Record<string, MeetingType> })
        .meetingTypes;
      if (stored && Object.keys(stored).length > 0) source = Object.values(stored);
    }
    const now = new Date().toISOString();
    db.insert(meeting_types)
      .values(
        source.map((t, i) => ({
          id: randomUUID(),
          slug: t.slug,
          name: t.name,
          description: t.description ?? '',
          duration_minutes: t.durationMinutes,
          buffer_before_minutes: t.bufferBeforeMinutes ?? 0,
          buffer_after_minutes: t.bufferAfterMinutes ?? 0,
          sort_order: i,
          created_at: now,
          updated_at: now,
        })),
      )
      .onConflictDoNothing()
      .run();
  }
  seeded = true;
}

/** For tests that wipe the table. */
export function resetMeetingTypeSeedForTests() {
  seeded = false;
}

export function listMeetingTypes({ includeArchived = false } = {}): MeetingType[] {
  ensureSeeded();
  const rows = getDb()
    .select()
    .from(meeting_types)
    .where(includeArchived ? undefined : eq(meeting_types.status, 'active'))
    .orderBy(asc(meeting_types.sort_order), asc(meeting_types.created_at))
    .all();
  return rows.map(toMeetingType);
}

export function getMeetingTypeBySlug(
  slug: string,
  { includeArchived = false } = {},
): MeetingType | null {
  ensureSeeded();
  const row = getDb().select().from(meeting_types).where(eq(meeting_types.slug, slug)).get();
  if (!row || (!includeArchived && row.status !== 'active')) return null;
  return toMeetingType(row);
}

export function getMeetingTypeById(id: string): MeetingType | null {
  ensureSeeded();
  const row = getDb().select().from(meeting_types).where(eq(meeting_types.id, id)).get();
  return row ? toMeetingType(row) : null;
}

export interface MeetingTypeInput {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  locationKind: LocationKind;
  locationDetail: string | null;
  maxPerDay: number | null;
  isPrivate: boolean;
}

export class MeetingTypeError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'MeetingTypeError';
  }
}

function columns(input: MeetingTypeInput) {
  return {
    slug: input.slug,
    name: input.name,
    description: input.description,
    duration_minutes: input.durationMinutes,
    buffer_before_minutes: input.bufferBeforeMinutes,
    buffer_after_minutes: input.bufferAfterMinutes,
    location_kind: input.locationKind,
    location_detail: input.locationDetail,
    max_per_day: input.maxPerDay,
    is_private: input.isPrivate,
  };
}

export function bookingCountForType(slug: string): number {
  return (
    getDb()
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.type_slug, slug))
      .get()?.n ?? 0
  );
}

export function createMeetingType(input: MeetingTypeInput): MeetingType {
  ensureSeeded();
  const db = getDb();
  if (db.select().from(meeting_types).where(eq(meeting_types.slug, input.slug)).get()) {
    throw new MeetingTypeError(`The link name “${input.slug}” is already used`, 409);
  }
  const maxOrder =
    db
      .select({ m: sql<number>`coalesce(max(sort_order), -1)` })
      .from(meeting_types)
      .get()?.m ?? -1;
  const now = new Date().toISOString();
  const id = randomUUID();
  db.insert(meeting_types)
    .values({ id, ...columns(input), sort_order: maxOrder + 1, created_at: now, updated_at: now })
    .run();
  return getMeetingTypeById(id)!;
}

export function updateMeetingType(id: string, input: MeetingTypeInput): MeetingType {
  const db = getDb();
  const existing = getMeetingTypeById(id);
  if (!existing) throw new MeetingTypeError('Meeting type not found', 404);
  if (input.slug !== existing.slug) {
    // Existing bookings and shared links refer to the slug, so it is fixed once used.
    if (bookingCountForType(existing.slug) > 0) {
      throw new MeetingTypeError(
        'The link name can’t change once this type has bookings. Create a new type instead.',
        409,
      );
    }
    if (db.select().from(meeting_types).where(eq(meeting_types.slug, input.slug)).get()) {
      throw new MeetingTypeError(`The link name “${input.slug}” is already used`, 409);
    }
  }
  db.update(meeting_types)
    .set({ ...columns(input), updated_at: new Date().toISOString() })
    .where(eq(meeting_types.id, id))
    .run();
  return getMeetingTypeById(id)!;
}

export function setMeetingTypeStatus(id: string, status: 'active' | 'archived'): MeetingType {
  const existing = getMeetingTypeById(id);
  if (!existing) throw new MeetingTypeError('Meeting type not found', 404);
  if (status === 'archived') {
    const activeCount = listMeetingTypes().length;
    if (existing.status === 'active' && activeCount <= 1) {
      throw new MeetingTypeError('Keep at least one active meeting type so guests can book.');
    }
  }
  getDb()
    .update(meeting_types)
    .set({ status, updated_at: new Date().toISOString() })
    .where(eq(meeting_types.id, id))
    .run();
  return getMeetingTypeById(id)!;
}

/** Deletes a type that has never been booked; types with history must be archived instead. */
export function deleteMeetingType(id: string) {
  const existing = getMeetingTypeById(id);
  if (!existing) throw new MeetingTypeError('Meeting type not found', 404);
  if (bookingCountForType(existing.slug) > 0) {
    throw new MeetingTypeError(
      'This type has bookings, so it can’t be deleted. Archive it to stop new bookings.',
      409,
    );
  }
  if (existing.status === 'active' && listMeetingTypes().length <= 1) {
    throw new MeetingTypeError('Keep at least one active meeting type so guests can book.');
  }
  getDb().delete(meeting_types).where(eq(meeting_types.id, id)).run();
}

/** Applies a new display order (ids in the desired order). */
export function reorderMeetingTypes(ids: string[]) {
  const db = getDb();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    ids.forEach((id, i) => {
      tx.update(meeting_types)
        .set({ sort_order: i, updated_at: now })
        .where(eq(meeting_types.id, id))
        .run();
    });
  });
}

/**
 * Backwards compatibility for the CRM config API, which sends the complete set of types:
 * upserts each by slug and archives active types that are missing from the set.
 */
export function syncMeetingTypesFromConfig(types: Record<string, MeetingType>) {
  ensureSeeded();
  const db = getDb();
  const now = new Date().toISOString();
  const slugs = Object.keys(types);
  db.transaction((tx) => {
    Object.values(types).forEach((t, i) => {
      const existing = tx.select().from(meeting_types).where(eq(meeting_types.slug, t.slug)).get();
      const values = {
        name: t.name,
        description: t.description ?? '',
        duration_minutes: t.durationMinutes,
        buffer_before_minutes: t.bufferBeforeMinutes,
        buffer_after_minutes: t.bufferAfterMinutes,
        status: 'active' as const,
        sort_order: i,
        updated_at: now,
      };
      if (existing) {
        tx.update(meeting_types).set(values).where(eq(meeting_types.id, existing.id)).run();
      } else {
        tx.insert(meeting_types)
          .values({ id: randomUUID(), slug: t.slug, created_at: now, ...values })
          .run();
      }
    });
    const stale = tx
      .select({ id: meeting_types.id, slug: meeting_types.slug })
      .from(meeting_types)
      .where(eq(meeting_types.status, 'active'))
      .all()
      .filter((r) => !slugs.includes(r.slug))
      .map((r) => r.id);
    if (stale.length) {
      tx.update(meeting_types)
        .set({ status: 'archived', updated_at: now })
        .where(and(inArray(meeting_types.id, stale), eq(meeting_types.status, 'active')))
        .run();
    }
  });
}
