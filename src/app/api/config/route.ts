import { NextResponse } from 'next/server';
import { env } from '@/env';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { isTurnstileEnabled } from '@/lib/security/turnstile';
import type { DayOfWeek } from '@/lib/slots/types';

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

export async function GET() {
  const config = getAvailabilityConfig();

  return NextResponse.json(
    {
      turnstileSiteKey: isTurnstileEnabled() ? env.TURNSTILE_SITE_KEY : null,
      timezone: config.timezone,
      maxAdvanceDays: config.maxAdvanceDays,
      workingWeekdays: (Object.keys(JS_WEEKDAY) as DayOfWeek[])
        .filter((day) => (config.workingHours[day] || []).length > 0)
        .map((day) => JS_WEEKDAY[day]),
      meetingTypes: Object.values(config.meetingTypes).map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
        durationMinutes: t.durationMinutes,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
