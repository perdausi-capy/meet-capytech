import { NextResponse } from 'next/server';
import { getBookingByRawToken, isPastChangeCutoff } from '@/lib/booking/manage';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = getBookingByRawToken(token);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const isCutoff = isPastChangeCutoff(booking.starts_at);

  return NextResponse.json({
    id: booking.id,
    typeSlug: booking.type_slug,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    name: booking.name,
    email: booking.email,
    notes: booking.notes,
    status: booking.status,
    canModify: !isCutoff && booking.status === 'confirmed',
  });
}
