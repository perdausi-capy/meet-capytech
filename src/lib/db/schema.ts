import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const bookings = sqliteTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    type_slug: text('type_slug').notNull(),
    starts_at: text('starts_at').notNull(),
    ends_at: text('ends_at').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    company: text('company'),
    notes: text('notes'),
    status: text('status', { enum: ['pending', 'confirmed', 'cancelled', 'rescheduled'] })
      .default('pending')
      .notNull(),
    rescheduled_to: text('rescheduled_to'),
    /** IANA zone the guest booked in, so emails can show their local time. */
    guest_timezone: text('guest_timezone'),
    /** Private note from the host (admin only, never shown to the guest). */
    host_notes: text('host_notes'),
    attendance: text('attendance', { enum: ['attended', 'no_show'] }),
    cancelled_by: text('cancelled_by', { enum: ['guest', 'host'] }),
    event_id: text('event_id'),
    manage_token_hash: text('manage_token_hash').unique().notNull(),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => ({
    doubleBookingGuard: uniqueIndex('double_booking_guard_idx')
      .on(table.starts_at)
      .where(sql`status IN ('pending', 'confirmed')`),
    updatedAtIdx: index('updated_at_idx').on(table.updated_at),
  }),
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const google_tokens = sqliteTable('google_tokens', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  refresh_token_enc: text('refresh_token_enc').notNull(),
  access_token_enc: text('access_token_enc').notNull(),
  expires_at: text('expires_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const busy_cache = sqliteTable('busy_cache', {
  source: text('source').primaryKey(),
  range_from: text('range_from').notNull(),
  range_to: text('range_to').notNull(),
  ranges_json: text('ranges_json').notNull(),
  fetched_at: text('fetched_at').notNull(),
});

/**
 * Background work (emails, retries, backups) that must survive restarts.
 * `dedupe_key` lets a caller find or replace a job, e.g. one reminder per booking.
 */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed', 'cancelled'] })
      .default('queued')
      .notNull(),
    run_at: text('run_at').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    max_attempts: integer('max_attempts').default(5).notNull(),
    last_error: text('last_error'),
    dedupe_key: text('dedupe_key'),
    locked_at: text('locked_at'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => ({
    dueIdx: index('jobs_due_idx').on(table.status, table.run_at),
    activeDedupe: uniqueIndex('jobs_active_dedupe_idx')
      .on(table.dedupe_key)
      .where(sql`status IN ('queued', 'running')`),
  }),
);

/** Bookable meeting types, managed from the admin. Bookings reference them by `slug`. */
export const meeting_types = sqliteTable(
  'meeting_types',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    duration_minutes: integer('duration_minutes').notNull(),
    buffer_before_minutes: integer('buffer_before_minutes').notNull().default(0),
    buffer_after_minutes: integer('buffer_after_minutes').notNull().default(0),
    location_kind: text('location_kind', {
      enum: ['google_meet', 'zoom', 'phone', 'in_person', 'custom'],
    })
      .notNull()
      .default('google_meet'),
    /** Address, phone number, Zoom URL or free text, depending on `location_kind`. */
    location_detail: text('location_detail'),
    /** Optional cap on bookings of this type per day (host calendar day). */
    max_per_day: integer('max_per_day'),
    /** Private types are bookable only via their direct link (/?type=slug). */
    is_private: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    sort_order: integer('sort_order').notNull().default(0),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => ({
    statusIdx: index('meeting_types_status_idx').on(table.status, table.sort_order),
  }),
);

/** One-off changes to the weekly hours for a single host-calendar date. */
export const availability_overrides = sqliteTable('availability_overrides', {
  /** YYYY-MM-DD in the host's time zone. */
  date: text('date').primaryKey(),
  /** `closed`: no bookings that day. `custom`: use `windows_json` instead of the weekly hours. */
  kind: text('kind', { enum: ['closed', 'custom'] }).notNull(),
  windows_json: text('windows_json').notNull().default('[]'),
  note: text('note'),
  updated_at: text('updated_at').notNull(),
});
