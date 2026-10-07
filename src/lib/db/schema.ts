import { sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
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
