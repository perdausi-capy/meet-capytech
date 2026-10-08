import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import {
  bookingCountForType,
  createMeetingType,
  listMeetingTypes,
  MeetingTypeError,
} from '@/lib/meeting-types';
import { meetingTypeInputSchema } from '@/lib/meeting-type-schema';

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });

export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const types = listMeetingTypes({ includeArchived: true }).map((t) => ({
    ...t,
    bookingCount: bookingCountForType(t.slug),
  }));
  return NextResponse.json({ meetingTypes: types });
}

export async function POST(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const parsed = meetingTypeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid meeting type', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ meetingType: createMeetingType(parsed.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof MeetingTypeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
