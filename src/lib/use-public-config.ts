'use client';

import { useEffect, useState } from 'react';

export interface PublicMeetingType {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
}

export interface PublicProfile {
  name: string;
  title: string;
  company: string;
  bio: string;
  avatarUrl: string | null;
  location: string;
}

export interface PublicConfig {
  turnstileSiteKey: string | null;
  profile: PublicProfile;
  timezone: string;
  maxAdvanceDays: number;
  /** JS Date#getDay() numbers (0 = Sunday) on which the host works. */
  workingWeekdays: number[];
  meetingTypes: PublicMeetingType[];
}

/** Loads the public booking config (meeting types, host time zone, booking window). */
export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/config')
      .then((res) => {
        if (!res.ok) throw new Error('CONFIG UNAVAILABLE');
        return res.json();
      })
      .then((data: PublicConfig) => {
        if (active) setConfig(data);
      })
      .catch(() => {
        if (active) setError('UNABLE TO LOAD BOOKING OPTIONS. PLEASE REFRESH.');
      });
    return () => {
      active = false;
    };
  }, []);

  return { config, error };
}

export function detectTimezone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}
