import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getBookableSlots } from '@/lib/slots/engine';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/booking/google-event';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import { checkAndIncrementRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { sweepStalePendingBookings } from '@/lib/booking/sweep';
import { hostDateForSlot, reservePendingBooking, SlotTakenError } from '@/lib/booking/reserve';
import { dispatchWebhook } from '@/lib/webhooks/dispatcher';
import { logger } from '@/lib/logger';
import { randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '@/env';

const bookingSchema = z.object({
  meetingType: z.string(),
  // Accepted for backwards compatibility; the host date is derived from startTime instead,
  // because the guest's local date can differ from the host's.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .optional(),
  startTime: z.string().datetime(),
  name: z.string().min(2, 'Name is required').max(100),
  email: z.string().email('Valid email is required'),
  notes: z.string().max(1000).optional().default(''),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = bookingSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const {
      meetingType: typeSlug,
      startTime,
      name,
      email,
      notes,
      turnstileToken,
    } = parseResult.data;

    const rateCheck = checkAndIncrementRateLimit(request, email);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
    }

    const isHuman = await verifyTurnstileToken(turnstileToken, getClientIp(request));
    if (!isHuman) {
      return NextResponse.json(
        { error: 'CAPTCHA verification failed. Please try again.' },
        { status: 400 },
      );
    }

    sweepStalePendingBookings();

    const config = getAvailabilityConfig();
    const meetingConfig = config.meetingTypes[typeSlug];
    if (!meetingConfig) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

    const hostDate = hostDateForSlot(startTime, config.timezone);
    if (!hostDate) return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });

    const availableSlots = await getBookableSlots(hostDate, typeSlug).catch(() => null);
    if (!availableSlots) {
      return NextResponse.json(
        { error: 'Unable to verify availability at this time.' },
        { status: 503 },
      );
    }

    const startNode = new Date(startTime);
    const isValidSlot = availableSlots.some(
      (slot) => new Date(slot.startsAt).getTime() === startNode.getTime(),
    );
    if (!isValidSlot) {
      return NextResponse.json(
        { error: 'This time slot is no longer available. Please select another time.' },
        { status: 409 },
      );
    }

    const endNode = new Date(startNode.getTime() + meetingConfig.durationMinutes * 60 * 1000);

    const db = getDb();
    const bookingId = randomUUID();
    const manageToken = randomUUID();
    const manageTokenHash = createHash('sha256').update(manageToken).digest('hex');
    const now = new Date().toISOString();
    const startIso = startNode.toISOString();
    const endIso = endNode.toISOString();

    try {
      reservePendingBooking({
        id: bookingId,
        type_slug: typeSlug,
        starts_at: startIso,
        ends_at: endIso,
        name,
        email,
        notes,
        manage_token_hash: manageTokenHash,
        created_at: now,
        updated_at: now,
      });
    } catch (dbErr) {
      if (dbErr instanceof SlotTakenError) {
        return NextResponse.json({ error: dbErr.message }, { status: 409 });
      }
      throw dbErr;
    }

    let googleEvent;
    try {
      googleEvent = await createGoogleCalendarEvent({
        title: `${meetingConfig.name} - ${name}`,
        description: `Meeting with ${name} (${email})\nNotes: ${notes || 'None'}\n\nManage your booking here: ${env.BASE_URL}/manage/${manageToken}`,
        startsAt: startIso,
        endsAt: endIso,
        guestName: name,
        guestEmail: email,
      });
    } catch (googleErr) {
      logger.error(
        { googleErr, bookingId },
        'Google Calendar event creation failed; rolling back database reservation',
      );
      db.delete(bookings).where(eq(bookings.id, bookingId)).run();
      return NextResponse.json(
        { error: 'Failed to schedule calendar event. Reservation rolled back.' },
        { status: 502 },
      );
    }

    try {
      db.update(bookings)
        .set({
          status: 'confirmed',
          event_id: googleEvent.eventId,
          updated_at: new Date().toISOString(),
        })
        .where(eq(bookings.id, bookingId))
        .run();
    } catch (dbErr) {
      logger.error(
        { err: dbErr, bookingId, eventId: googleEvent.eventId },
        'Failed to confirm booking after calendar event creation',
      );
      try {
        await deleteGoogleCalendarEvent(googleEvent.eventId);
      } catch (deleteErr) {
        logger.error(
          { err: deleteErr, bookingId, eventId: googleEvent.eventId },
          'Failed to delete Google Calendar event after confirmation failure',
        );
      }
      db.delete(bookings).where(eq(bookings.id, bookingId)).run();
      return NextResponse.json(
        { error: 'Failed to confirm reservation. Calendar event was rolled back.' },
        { status: 502 },
      );
    }

    dispatchWebhook('booking.created', {
      id: bookingId,
      typeSlug,
      status: 'confirmed',
      startsAt: startIso,
      endsAt: endIso,
      name,
      email,
      notes,
    }).catch(() => {});

    logger.info({ bookingId, email, startTime, eventId: googleEvent.eventId }, 'Booking confirmed');

    return NextResponse.json(
      { success: true, bookingId, manageToken, meetLink: googleEvent.meetLink },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to create booking');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
