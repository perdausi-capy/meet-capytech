import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
import { getBookableSlotsBetween } from '@/lib/slots/engine';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { checkAndIncrementRateLimit } from '@/lib/security/rate-limit';
import { sweepStalePendingBookings } from '@/lib/booking/sweep';
import { logger } from '@/lib/logger';
import type { Slot } from '@/lib/slots/types';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  type: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM'),
  tz: z
    .string()
    .refine((tz) => IANAZone.isValidZone(tz), 'Unknown IANA time zone')
    .optional(),
});

/**
 * GET /api/availability?type=intro&month=2026-10&tz=Asia/Manila
 *
 * Every bookable slot in a calendar month of the guest's time zone, grouped by the guest's local
 * date. Days with no slots are omitted, so the calendar can grey them out before any click.
 */
export async function GET(request: Request) {
  const rateCheck = checkAndIncrementRateLimit(request, undefined, 'read');
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    type: searchParams.get('type'),
    month: searchParams.get('month'),
    tz: searchParams.get('tz') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { type, month } = parsed.data;
  const config = getAvailabilityConfig();
  const guestTz = parsed.data.tz ?? config.timezone;

  if (!config.meetingTypes[type]) {
    return NextResponse.json({ error: 'Invalid meeting type' }, { status: 400 });
  }

  sweepStalePendingBookings();

  // The guest's month, expressed as the host-calendar dates it touches.
  const monthStart = DateTime.fromISO(`${month}-01`, { zone: guestTz }).startOf('month');
  const monthEnd = monthStart.endOf('month');
  const hostFrom = monthStart.setZone(config.timezone).toISODate() as string;
  const hostTo = monthEnd.setZone(config.timezone).toISODate() as string;

  try {
    const slots = await getBookableSlotsBetween(hostFrom, hostTo, type);

    const days: Record<string, Slot[]> = {};
    for (const slot of slots) {
      const local = DateTime.fromISO(slot.startsAt).setZone(guestTz);
      if (local < monthStart || local > monthEnd) continue;
      (days[local.toISODate() as string] ??= []).push(slot);
    }

    return NextResponse.json(
      { type, month, timezone: guestTz, days },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to compute month availability — failing closed');
    return NextResponse.json(
      { error: 'Unable to verify availability at this time.' },
      { status: 503 },
    );
  }
}
