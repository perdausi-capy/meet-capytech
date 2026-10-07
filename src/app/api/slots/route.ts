import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBookableSlots } from '@/lib/slots/engine';
import { checkAndIncrementRateLimit } from '@/lib/security/rate-limit';
import { sweepStalePendingBookings } from '@/lib/booking/sweep';
import { logger } from '@/lib/logger';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  type: z.string(),
});

export async function GET(request: Request) {
  const rateCheck = checkAndIncrementRateLimit(request);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
  }

  sweepStalePendingBookings();

  try {
    const { searchParams } = new URL(request.url);
    const parseResult = querySchema.safeParse({
      date: searchParams.get('date'),
      type: searchParams.get('type'),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const { date, type } = parseResult.data;
    const slots = await getBookableSlots(date, type);

    return NextResponse.json({ date, type, slots });
  } catch (error: any) {
    if (error.message === 'Invalid meeting type') {
      return NextResponse.json({ error: 'Invalid meeting type' }, { status: 400 });
    }
    logger.error({ err: error }, 'Failed to fetch slots — failing closed');
    return NextResponse.json(
      { error: 'Unable to verify availability at this time.' },
      { status: 503 },
    );
  }
}
