import { NextResponse } from 'next/server';
import { env } from '@/env';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { isTurnstileEnabled } from '@/lib/security/turnstile';
import type { DayOfWeek } from '@/lib/slots/types';
import { getHostProfile } from '@/lib/profile';
import { locationLabel } from '@/lib/meeting-types';

// Read at request time: keys come from the runtime .env and the config can change via the admin API.
export const dynamic = 'force-dynamic';

// JS Date#getDay() numbering, so the browser can use it directly.
const JS_WEEKDAY: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export async function GET(request: Request) {
  const config = getAvailabilityConfig();
  // Private types are hidden from the list but included when their direct link is opened.
  const linked = new URL(request.url).searchParams.get('type');

  return NextResponse.json(
    {
      turnstileSiteKey: isTurnstileEnabled() ? env.TURNSTILE_SITE_KEY : null,
      profile: getHostProfile(),
      timezone: config.timezone,
      maxAdvanceDays: config.maxAdvanceDays,
      workingWeekdays: (Object.keys(JS_WEEKDAY) as DayOfWeek[])
        .filter((day) => (config.workingHours[day] || []).length > 0)
        .map((day) => JS_WEEKDAY[day]),
      meetingTypes: Object.values(config.meetingTypes)
        .filter((t) => !t.isPrivate || t.slug === linked)
        .map((t) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          durationMinutes: t.durationMinutes,
          location: locationLabel(t),
          locationKind: t.locationKind ?? 'google_meet',
          isPrivate: Boolean(t.isPrivate),
        })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
