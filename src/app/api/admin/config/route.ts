import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const configSchema = z.object({
  minNoticeHours: z.number().optional(),
  maxAdvanceDays: z.number().optional(),
  slotIntervalMinutes: z.number().optional(),
  workingHours: z.record(z.array(z.object({ start: z.string(), end: z.string() }))).optional(),
  meetingTypes: z
    .record(
      z.object({
        slug: z.string(),
        name: z.string(),
        description: z.string(),
        durationMinutes: z.number(),
        bufferBeforeMinutes: z.number(),
        bufferAfterMinutes: z.number(),
      }),
    )
    .optional(),
});

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
    const mergedConfig = { ...currentConfig, ...parseResult.data };

    const db = getDb();
    db.insert(settings)
      .values({
        key: 'availability',
        value: JSON.stringify(mergedConfig),
        updated_at: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: JSON.stringify(mergedConfig),
          updated_at: new Date().toISOString(),
        },
      })
      .run();

    logger.info('Availability configuration updated via admin API');
    return NextResponse.json({ success: true, config: mergedConfig });
  } catch (err) {
    logger.error({ err }, 'Failed to update admin config');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
