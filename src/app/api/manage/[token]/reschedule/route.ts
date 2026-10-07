import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBookingByRawToken, isPastChangeCutoff } from '@/lib/booking/manage';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getBookableSlots } from '@/lib/slots/engine';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/booking/google-event';
import { checkAndIncrementRateLimit } from '@/lib/security/rate-limit';
import { dispatchWebhook } from '@/lib/webhooks/dispatcher';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { logger } from '@/lib/logger';

const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  startTime: z.string().datetime(),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const rateCheck = checkAndIncrementRateLimit(request);
  if (!rateCheck.allowed) return NextResponse.json({ error: rateCheck.reason }, { status: 429 });

  const { token } = await params;
  const existingBooking = getBookingByRawToken(token);

  if (!existingBooking) {
    return NextResponse.json({ error: 'Valid booking not found' }, { status: 404 });
  }

  if (existingBooking.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'Booking is no longer active', rescheduled_to: existingBooking.rescheduled_to },
      { status: 410 },
    );
  }

  if (isPastChangeCutoff(existingBooking.starts_at)) {
    return NextResponse.json(
      { error: 'Bookings cannot be rescheduled less than 2 hours before the start time.' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parseResult = rescheduleSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parseResult.error.format() },
      { status: 400 },
    );
  }

  const { date, startTime } = parseResult.data;

  const availableSlots = await getBookableSlots(date, existingBooking.type_slug).catch(() => null);
  if (!availableSlots)
    return NextResponse.json(
      { error: 'Unable to verify availability at this time.' },
      { status: 503 },
    );

  const isValidSlot = availableSlots.some((slot) => slot.startsAt === startTime);
  if (!isValidSlot) {
    return NextResponse.json(
      { error: 'This time slot is no longer available. Please select another time.' },
      { status: 409 },
    );
  }

  const config = getAvailabilityConfig();
  const meetingConfig = config.meetingTypes[existingBooking.type_slug];
  if (!meetingConfig) return NextResponse.json({ error: 'Invalid meeting type' }, { status: 400 });

  const newStartNode = new Date(startTime);
  const newEndNode = new Date(newStartNode.getTime() + meetingConfig.durationMinutes * 60 * 1000);

  const db = getDb();
  const newBookingId = randomUUID();
  const newManageToken = randomUUID();
  const newManageTokenHash = createHash('sha256').update(newManageToken).digest('hex');
  const now = new Date().toISOString();

  let newGoogleEvent;
  try {
    newGoogleEvent = await createGoogleCalendarEvent({
      title: `${meetingConfig.name} - ${existingBooking.name}`,
      description: `Meeting with ${existingBooking.name} (${existingBooking.email})\nNotes: ${existingBooking.notes || 'None'}\n\nManage your booking here: ${process.env.BASE_URL}/manage/${newManageToken}`,
      startsAt: newStartNode.toISOString(),
      endsAt: newEndNode.toISOString(),
      guestName: existingBooking.name,
      guestEmail: existingBooking.email,
    });
  } catch (googleErr) {
    return NextResponse.json(
      { error: 'Failed to schedule new calendar event. Original booking preserved.' },
      { status: 502 },
    );
  }

  if (existingBooking.event_id) {
    try {
      await deleteGoogleCalendarEvent(existingBooking.event_id);
    } catch (e) {
      logger.error(
        { err: e, eventId: existingBooking.event_id },
        'Failed to delete old event during reschedule',
      );
    }
  }

  try {
    db.transaction((tx) => {
      tx.insert(bookings)
        .values({
          id: newBookingId,
          type_slug: existingBooking.type_slug,
          status: 'confirmed',
          starts_at: newStartNode.toISOString(),
          ends_at: newEndNode.toISOString(),
          name: existingBooking.name,
          email: existingBooking.email,
          notes: existingBooking.notes,
          event_id: newGoogleEvent.eventId,
          manage_token_hash: newManageTokenHash,
          created_at: now,
          updated_at: now,
        })
        .run();

      tx.update(bookings)
        .set({ status: 'rescheduled', rescheduled_to: newBookingId, updated_at: now })
        .where(eq(bookings.id, existingBooking.id))
        .run();
    });
  } catch (dbErr: any) {
    logger.error({ err: dbErr }, 'Transaction failed during reschedule');
    return NextResponse.json({ error: 'Database transaction failed.' }, { status: 500 });
  }

  dispatchWebhook('booking.rescheduled', {
    id: newBookingId,
    typeSlug: existingBooking.type_slug,
    status: 'confirmed',
    startsAt: newStartNode.toISOString(),
    endsAt: newEndNode.toISOString(),
    name: existingBooking.name,
    email: existingBooking.email,
    notes: existingBooking.notes,
  }).catch(() => {});

  logger.info(
    { oldId: existingBooking.id, newId: newBookingId },
    'Booking successfully rescheduled',
  );

  return NextResponse.json({
    success: true,
    bookingId: newBookingId,
    manageToken: newManageToken,
    meetLink: newGoogleEvent.meetLink,
  });
}
