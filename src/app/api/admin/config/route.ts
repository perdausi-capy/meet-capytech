import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getAvailabilityConfig, saveAvailabilityRules } from '@/lib/slots/config';
import { syncMeetingTypesFromConfig } from '@/lib/meeting-types';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { IANAZone } from 'luxon';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24h)');
const dayWindows = z.array(
  z
    .object({ start: hhmm, end: hhmm })
    .refine((w) => w.start < w.end, { message: 'start must be before end' }),
);

const meetingTypeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and dashes only'),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  durationMinutes: z.number().int().min(5).max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(240),
  bufferAfterMinutes: z.number().int().min(0).max(240),
});

const configSchema = z
  .object({
    timezone: z
      .string()
      .refine((tz) => IANAZone.isValidZone(tz), { message: 'Unknown IANA time zone' })
      .optional(),
    minNoticeHours: z
      .number()
      .min(0)
      .max(24 * 90)
      .optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).optional(),
    slotIntervalMinutes: z.number().int().min(5).max(240).optional(),
    maxMeetingsPerDay: z.number().int().min(1).max(50).nullable().optional(),
    workingHours: z
      .object({
        monday: dayWindows,
        tuesday: dayWindows,
        wednesday: dayWindows,
        thursday: dayWindows,
        friday: dayWindows,
        saturday: dayWindows,
        sunday: dayWindows,
      })
      .partial()
      .strict()
      .optional(),
    // Replaces the full set of meeting types (that is how a type gets removed).
    meetingTypes: z
      .record(meetingTypeSchema)
      .refine((types) => Object.keys(types).length > 0, {
        message: 'At least one meeting type is required',
      })
      .refine((types) => Object.entries(types).every(([key, t]) => key === t.slug), {
        message: 'Each meeting type key must equal its slug',
      })
      .optional(),
  })
  .strict();

export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }
  return NextResponse.json({ config: getAvailabilityConfig() });
}

export async function POST(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parseResult = configSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid config payload', details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const currentConfig = getAvailabilityConfig();
    const mergedConfig = {
      ...currentConfig,
      ...parseResult.data,
      // Days not mentioned in the update keep their current hours.
      workingHours: { ...currentConfig.workingHours, ...parseResult.data.workingHours },
    };

    // Meeting types live in their own table; the rest of the rules stay in settings.
    if (parseResult.data.meetingTypes) syncMeetingTypesFromConfig(parseResult.data.meetingTypes);
    const { meetingTypes: _types, ...rules } = mergedConfig;
    void _types;
    saveAvailabilityRules(rules);

    logger.info('Availability configuration updated via admin API');
    return NextResponse.json({ success: true, config: getAvailabilityConfig() });
  } catch (err) {
    logger.error({ err }, 'Failed to update admin config');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
