import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { overrideInputSchema } from '@/lib/availability-schema';
import { upsertOverride } from '@/lib/availability-overrides';

/** Closes, or sets special hours for, every date from `from` to `to` (inclusive). */
export async function POST(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }
  const parsed = overrideInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the highlighted fields.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { from, to, kind, windows, note } = parsed.data;
  const dates: string[] = [];
  for (let d = DateTime.fromISO(from); d.toISODate()! <= to; d = d.plus({ days: 1 })) {
    dates.push(d.toISODate()!);
  }
  for (const date of dates) upsertOverride({ date, kind, windows, note });
  return NextResponse.json({ saved: dates.length });
}
