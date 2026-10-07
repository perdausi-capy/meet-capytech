export interface TimeRange {
  start: Date;
  end: Date;
}

export interface MeetingType {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
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
  meetingTypes: Record<string, MeetingType>;
}

export interface Slot {
  startsAt: string; // ISO 8601 string in UTC
  endsAt: string; // ISO 8601 string in UTC
}
