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
