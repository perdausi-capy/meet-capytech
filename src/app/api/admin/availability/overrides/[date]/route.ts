import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { deleteOverride } from '@/lib/availability-overrides';
import { isoDate } from '@/lib/availability-schema';

/** Removes the override for one date (it goes back to the weekly hours). */
export async function DELETE(request: Request, { params }: { params: Promise<{ date: string }> }) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }
  const { date } = await params;
  if (!isoDate.safeParse(date).success) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  deleteOverride(date);
  return NextResponse.json({ success: true });
}
