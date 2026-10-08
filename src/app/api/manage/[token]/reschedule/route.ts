import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBookingByRawToken, isPastChangeCutoff } from '@/lib/booking/manage';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getBookableSlots } from '@/lib/slots/engine';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/booking/google-event';
import { hostDateForSlot, reservePendingBooking, SlotTakenError } from '@/lib/booking/reserve';
import { checkAndIncrementRateLimit } from '@/lib/security/rate-limit';
import { dispatchWebhook } from '@/lib/webhooks/dispatcher';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { logger } from '@/lib/logger';
import { env } from '@/env';

const rescheduleSchema = z.object({
  // Accepted for backwards compatibility; the host date is derived from startTime.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .optional(),
  startTime: z.string().datetime(),
});

const OLD_EVENT_DELETE_ATTEMPTS = 3;

async function deleteOldEventWithRetry(eventId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= OLD_EVENT_DELETE_ATTEMPTS; attempt++) {
    try {
      await deleteGoogleCalendarEvent(eventId);
      return true;
    } catch (err) {
      logger.warn({ err, eventId, attempt }, 'Retrying deletion of old event after reschedule');
      if (attempt < OLD_EVENT_DELETE_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  return false;
}

/**
 * Order matters so the guest can never lose their original slot:
 * 1. reserve the new slot in the DB (atomic, rejects overlaps)
 * 2. create the new Google event (on failure: release the reservation, original untouched)
 * 3. confirm new + mark old as rescheduled in one transaction (on failure: undo 1 and 2)
 * 4. only then remove the old Google event, retrying and reporting if it can't be removed
 */
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

  const { startTime } = parseResult.data;

  const config = getAvailabilityConfig();
  const meetingConfig = config.meetingTypes[existingBooking.type_slug];
  if (!meetingConfig) return NextResponse.json({ error: 'Invalid meeting type' }, { status: 400 });

  const hostDate = hostDateForSlot(startTime, config.timezone);
  if (!hostDate) return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });

  const availableSlots = await getBookableSlots(hostDate, existingBooking.type_slug).catch(
    () => null,
  );
  if (!availableSlots)
    return NextResponse.json(
      { error: 'Unable to verify availability at this time.' },
      { status: 503 },
    );

  const newStartNode = new Date(startTime);
  const isValidSlot = availableSlots.some(
    (slot) => new Date(slot.startsAt).getTime() === newStartNode.getTime(),
  );
  if (!isValidSlot) {
    return NextResponse.json(
      { error: 'This time slot is no longer available. Please select another time.' },
      { status: 409 },
    );
  }

  const newEndNode = new Date(newStartNode.getTime() + meetingConfig.durationMinutes * 60 * 1000);
  const newStartIso = newStartNode.toISOString();
  const newEndIso = newEndNode.toISOString();

  const db = getDb();
  const newBookingId = randomUUID();
  const newManageToken = randomUUID();
  const newManageTokenHash = createHash('sha256').update(newManageToken).digest('hex');
  const now = new Date().toISOString();

  // 1. Reserve the new slot.
  try {
    reservePendingBooking({
      id: newBookingId,
      type_slug: existingBooking.type_slug,
      starts_at: newStartIso,
      ends_at: newEndIso,
      name: existingBooking.name,
      email: existingBooking.email,
      company: existingBooking.company,
      notes: existingBooking.notes,
      manage_token_hash: newManageTokenHash,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    logger.error({ err }, 'Failed to reserve new slot during reschedule');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  const releaseReservation = () =>
    db
      .delete(bookings)
      .where(and(eq(bookings.id, newBookingId), eq(bookings.status, 'pending')))
      .run();

  // 2. Create the new calendar event.
  let newGoogleEvent;
  try {
    newGoogleEvent = await createGoogleCalendarEvent({
      title: `${meetingConfig.name} - ${existingBooking.name}`,
      description: `Meeting with ${existingBooking.name} (${existingBooking.email})\nNotes: ${existingBooking.notes || 'None'}\n\nManage your booking here: ${env.BASE_URL}/manage/${newManageToken}`,
      startsAt: newStartIso,
      endsAt: newEndIso,
      guestName: existingBooking.name,
      guestEmail: existingBooking.email,
    });
  } catch (googleErr) {
    logger.error(
      { err: googleErr, bookingId: existingBooking.id },
      'Reschedule event creation failed',
    );
    releaseReservation();
    return NextResponse.json(
      { error: 'Failed to schedule new calendar event. Original booking preserved.' },
      { status: 502 },
    );
  }

  // 3. Swap the bookings atomically. The status guard on the old row stops a concurrent
  //    cancel/reschedule of the same booking from being silently overwritten.
  try {
    db.transaction((tx) => {
      const swapped = tx
        .update(bookings)
        .set({ status: 'rescheduled', rescheduled_to: newBookingId, updated_at: now })
        .where(and(eq(bookings.id, existingBooking.id), eq(bookings.status, 'confirmed')))
        .run();
      if (swapped.changes !== 1) throw new Error('ORIGINAL_NO_LONGER_CONFIRMED');

      tx.update(bookings)
        .set({ status: 'confirmed', event_id: newGoogleEvent.eventId, updated_at: now })
        .where(eq(bookings.id, newBookingId))
        .run();
    });
  } catch (dbErr: any) {
    logger.error({ err: dbErr, bookingId: existingBooking.id }, 'Reschedule swap failed; undoing');
    await deleteGoogleCalendarEvent(newGoogleEvent.eventId).catch((err) =>
      logger.error(
        { err, eventId: newGoogleEvent.eventId },
        'Failed to remove new event after aborted reschedule',
      ),
    );
    releaseReservation();
    if (dbErr?.message === 'ORIGINAL_NO_LONGER_CONFIRMED') {
      return NextResponse.json(
        { error: 'This booking was changed in the meantime.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Database transaction failed.' }, { status: 500 });
  }

  // 4. Remove the old event. The new booking is committed either way; a leftover old event is
  //    reported to the guest and logged for the host instead of being silently ignored.
  let oldEventRemoved = true;
  if (existingBooking.event_id) {
    oldEventRemoved = await deleteOldEventWithRetry(existingBooking.event_id);
    if (!oldEventRemoved) {
      logger.error(
        { bookingId: existingBooking.id, eventId: existingBooking.event_id },
        'Old calendar event could not be removed after reschedule; manual cleanup needed',
      );
    }
  }

  dispatchWebhook('booking.rescheduled', {
    id: newBookingId,
    typeSlug: existingBooking.type_slug,
    status: 'confirmed',
    startsAt: newStartIso,
    endsAt: newEndIso,
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
    ...(oldEventRemoved
      ? {}
      : {
          warning:
            'Your booking was moved, but the old calendar invite could not be removed. Please ignore it.',
        }),
  });
}
