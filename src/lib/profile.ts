import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';

/** Public host details shown on the booking page. Editable from the admin in M11. */
export interface HostProfile {
  name: string;
  title: string;
  company: string;
  bio: string;
  /** Absolute or site-relative image URL; initials are shown when absent. */
  avatarUrl: string | null;
  /** Shown on meeting type cards, e.g. "Google Meet". */
  location: string;
}

export const DEFAULT_PROFILE: HostProfile = {
  name: 'Jason',
  title: 'COO',
  company: 'Capytech UK',
  bio: 'Pick a time that suits you. You will get a calendar invite with a video link straight away.',
  avatarUrl: null,
  location: 'Google Meet',
};

export function getHostProfile(): HostProfile {
  try {
    const record = getDb().select().from(settings).where(eq(settings.key, 'profile')).get();
    if (record) return { ...DEFAULT_PROFILE, ...JSON.parse(record.value) };
  } catch {
    // Fall back to defaults if the settings table is unavailable (e.g. during setup).
  }
  return DEFAULT_PROFILE;
}
