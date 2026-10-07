import { AvailabilityConfig } from './types';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const DEFAULT_AVAILABILITY_CONFIG: AvailabilityConfig = {
  timezone: 'Europe/London',
  minNoticeHours: 24,
  maxAdvanceDays: 60,
  slotIntervalMinutes: 15,
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

export function getAvailabilityConfig(): AvailabilityConfig {
  try {
    const db = getDb();
    const record = db.select().from(settings).where(eq(settings.key, 'availability')).get();
    if (record) {
      return { ...DEFAULT_AVAILABILITY_CONFIG, ...JSON.parse(record.value) };
    }
  } catch (err) {
    // Failsafe during setup/tests if DB isn't fully migrated yet
  }
  return DEFAULT_AVAILABILITY_CONFIG;
}
