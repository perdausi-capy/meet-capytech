import { NextResponse } from 'next/server';
import { getBookingByRawToken, isPastChangeCutoff } from '@/lib/booking/manage';
import { deleteGoogleCalendarEvent } from '@/lib/booking/google-event';
import { checkAndIncrementRateLimit } from '@/lib/security/rate-limit';
import { queueWebhook } from '@/lib/webhooks/dispatcher';
import { queueBookingEmail } from '@/lib/booking/notify';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const rateCheck = checkAndIncrementRateLimit(request);
  if (!rateCheck.allowed) return NextResponse.json({ error: rateCheck.reason }, { status: 429 });

  const { token } = await params;
  const booking = getBookingByRawToken(token);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'This booking is no longer active', rescheduled_to: booking.rescheduled_to },
      { status: 410 },
    );
  }

  if (isPastChangeCutoff(booking.starts_at)) {
    return NextResponse.json(
      { error: 'Bookings cannot be cancelled less than 2 hours before the start time.' },
      { status: 400 },
    );
  }

  if (booking.event_id) {
    try {
      await deleteGoogleCalendarEvent(booking.event_id);
    } catch (err) {
      logger.error(
        { err, bookingId: booking.id },
        'Failed to delete event from Google Calendar during cancellation',
      );
      return NextResponse.json(
        { error: 'Failed to cancel event on Google Calendar. Please try again.' },
        { status: 502 },
      );
    }
  }

  const db = getDb();
  db.update(bookings)
    .set({ status: 'cancelled', updated_at: new Date().toISOString() })
    .where(eq(bookings.id, booking.id))
    .run();

  queueBookingEmail('booking_cancelled', booking.id);
  queueWebhook('booking.cancelled', {
    id: booking.id,
    typeSlug: booking.type_slug,
    status: 'cancelled',
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    name: booking.name,
    email: booking.email,
    notes: booking.notes,
  });

  logger.info({ bookingId: booking.id }, 'Booking cancelled by guest');
  return NextResponse.json({ success: true, message: 'Booking successfully cancelled' });
}
