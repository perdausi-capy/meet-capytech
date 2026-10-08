import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getAvailabilityConfig, saveAvailabilityRules } from '@/lib/slots/config';
import { availabilityRulesSchema } from '@/lib/availability-schema';
import { listUpcomingOverrides } from '@/lib/availability-overrides';
import { getUkBankHolidayEvents } from '@/lib/calendars/bank-holidays';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });

/** Rules, upcoming date overrides and the bank holidays inside the booking window. */
export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const config = getAvailabilityConfig();
  const today = DateTime.now().setZone(config.timezone).toISODate()!;
  const lastDay = DateTime.now()
    .setZone(config.timezone)
    .plus({ days: config.maxAdvanceDays })
    .toISODate()!;
  const holidays = (await getUkBankHolidayEvents()).filter(
    (h) => h.date >= today && h.date <= lastDay,
  );

  return NextResponse.json({
    rules: {
      timezone: config.timezone,
      minNoticeHours: config.minNoticeHours,
      maxAdvanceDays: config.maxAdvanceDays,
      slotIntervalMinutes: config.slotIntervalMinutes,
      maxMeetingsPerDay: config.maxMeetingsPerDay ?? null,
      workingHours: config.workingHours,
    },
    overrides: listUpcomingOverrides(today),
    bankHolidays: holidays,
  });
}

/** Replaces the availability rules (weekly hours + booking rules). */
export async function PUT(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const parsed = availabilityRulesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the highlighted fields.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  saveAvailabilityRules(parsed.data);
  logger.info('Availability rules updated from the admin');
  return NextResponse.json({ rules: parsed.data });
}
