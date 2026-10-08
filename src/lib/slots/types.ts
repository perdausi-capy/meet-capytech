export interface TimeRange {
  start: Date;
  end: Date;
}

export type LocationKind = 'google_meet' | 'zoom' | 'phone' | 'in_person' | 'custom';

export interface MeetingType {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  // Fields below come from the meeting_types table; optional so plain configs still type-check.
  id?: string;
  locationKind?: LocationKind;
  locationDetail?: string | null;
  /** Cap on bookings of this type per host-calendar day. */
  maxPerDay?: number | null;
  /** Bookable only via its direct link. */
  isPrivate?: boolean;
  status?: 'active' | 'archived';
  sortOrder?: number;
}

export interface WorkingWindow {
  /** Start time in 24h format (e.g. "09:00") */
  start: string;
  /** End time in 24h format (e.g. "17:00") */
  end: string;
}

export type DayOfWeek =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface AvailabilityConfig {
  timezone: string;
  minNoticeHours: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  workingHours: Record<DayOfWeek, WorkingWindow[]>;
  /** Active meeting types keyed by slug (archived ones are not bookable). */
  meetingTypes: Record<string, MeetingType>;
  /** Cap on all bookings per host-calendar day; null/undefined for no cap. */
  maxMeetingsPerDay?: number | null;
}

export interface AvailabilityOverride {
  /** YYYY-MM-DD in the host's time zone. */
  date: string;
  kind: 'closed' | 'custom';
  windows: WorkingWindow[];
  note?: string | null;
}

export interface Slot {
  startsAt: string; // ISO 8601 string in UTC
  endsAt: string; // ISO 8601 string in UTC
}
