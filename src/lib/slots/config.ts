import { AvailabilityConfig } from './types';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { listMeetingTypes } from '@/lib/meeting-types';

export const DEFAULT_AVAILABILITY_CONFIG: AvailabilityConfig = {
  timezone: 'Europe/London',
  minNoticeHours: 24,
  maxAdvanceDays: 60,
  slotIntervalMinutes: 15,
  maxMeetingsPerDay: null,
  meetingTypes: {
    intro: {
      slug: 'intro',
      name: 'Introductory Call',
      description: 'Quick alignment and introduction.',
      durationMinutes: 15,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
    },
    tech: {
      slug: 'tech',
      name: 'Technical Consultation',
      description: 'Deep dive into architecture or project scope.',
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 15,
    },
  },
  workingHours: {
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '16:00' }],
    saturday: [],
    sunday: [],
  },
};

/** Availability rules from settings, with the active meeting types from their own table. */
export function getAvailabilityConfig(): AvailabilityConfig {
  let stored: Partial<AvailabilityConfig> = {};
  try {
    const record = getDb().select().from(settings).where(eq(settings.key, 'availability')).get();
    if (record) stored = JSON.parse(record.value);
  } catch {
    // Failsafe during setup/tests if DB isn't fully migrated yet
  }
  // Meeting types used to live in this JSON; they are now managed in the meeting_types table.
  const { meetingTypes: _legacyTypes, ...rules } = stored;
  void _legacyTypes;

  let meetingTypes = DEFAULT_AVAILABILITY_CONFIG.meetingTypes;
  try {
    meetingTypes = Object.fromEntries(listMeetingTypes().map((t) => [t.slug, t]));
  } catch {
    // Table not migrated yet: fall back to the built-in types.
  }
  return { ...DEFAULT_AVAILABILITY_CONFIG, ...rules, meetingTypes };
}

/** Persists the availability rules (everything except meeting types). */
export function saveAvailabilityRules(rules: Omit<AvailabilityConfig, 'meetingTypes'>) {
  const value = JSON.stringify(rules);
  const updated_at = new Date().toISOString();
  getDb()
    .insert(settings)
    .values({ key: 'availability', value, updated_at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updated_at } })
    .run();
}
