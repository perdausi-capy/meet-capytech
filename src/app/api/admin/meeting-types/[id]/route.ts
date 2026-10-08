import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import {
  deleteMeetingType,
  MeetingTypeError,
  setMeetingTypeStatus,
  updateMeetingType,
} from '@/lib/meeting-types';
import { meetingTypeInputSchema } from '@/lib/meeting-type-schema';

type Ctx = { params: Promise<{ id: string }> };

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });

function handle(fn: () => unknown) {
  try {
    return NextResponse.json(fn() ?? { success: true });
  } catch (err) {
    if (err instanceof MeetingTypeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

/** Full update of a meeting type. */
export async function PUT(request: Request, { params }: Ctx) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const { id } = await params;
  const parsed = meetingTypeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid meeting type', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return handle(() => ({ meetingType: updateMeetingType(id, parsed.data) }));
}

const statusSchema = z.object({ status: z.enum(['active', 'archived']) }).strict();

/** Archive or restore. */
export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const { id } = await params;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  return handle(() => ({ meetingType: setMeetingTypeStatus(id, parsed.data.status) }));
}

/** Delete a type that was never booked. */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const { id } = await params;
  return handle(() => {
    deleteMeetingType(id);
    return { success: true };
  });
}
