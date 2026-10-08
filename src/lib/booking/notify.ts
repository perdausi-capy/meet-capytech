import { eq } from 'drizzle-orm';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs/queue';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getMeetingTypeBySlug } from '@/lib/meeting-types';
import { openSecret, sealSecret } from '@/lib/security/crypto';
import { sendEmail } from '@/lib/email/send';
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingRescheduledEmail,
  type BookingEmailData,
} from '@/lib/email/templates';

export const BOOKING_EMAIL_JOB = 'email.booking';

export type BookingEmailTemplate =
  'booking_confirmed' | 'booking_rescheduled' | 'booking_cancelled';

interface BookingEmailPayload {
  template: BookingEmailTemplate;
  bookingId: string;
  /** Sealed raw manage token; only the hash is stored on the booking itself. */
  manageToken?: string;
  meetLink?: string;
}

const renderers = {
  booking_confirmed: bookingConfirmedEmail,
  booking_rescheduled: bookingRescheduledEmail,
  booking_cancelled: bookingCancelledEmail,
} satisfies Record<BookingEmailTemplate, (d: BookingEmailData) => unknown>;

/** Queues a guest email for a booking. Safe to call more than once: duplicates are ignored. */
export function queueBookingEmail(
  template: BookingEmailTemplate,
  bookingId: string,
  extras: { manageToken?: string; meetLink?: string } = {},
): void {
  const payload: BookingEmailPayload = {
    template,
    bookingId,
    manageToken: extras.manageToken ? sealSecret(extras.manageToken) : undefined,
    meetLink: extras.meetLink,
  };
  enqueueJob(BOOKING_EMAIL_JOB, payload, { dedupeKey: `email:${template}:${bookingId}` });
}

/** Job handler: renders the email from the booking's current data and sends it. */
export async function sendBookingEmail(payload: BookingEmailPayload): Promise<void> {
  const booking = getDb().select().from(bookings).where(eq(bookings.id, payload.bookingId)).get();
  if (!booking) return; // Booking was removed (e.g. a rolled-back reservation); nothing to send.

  const config = getAvailabilityConfig();
  const meetingName =
    getMeetingTypeBySlug(booking.type_slug, { includeArchived: true })?.name ?? booking.type_slug;

  const data: BookingEmailData = {
    guestName: booking.name,
    guestEmail: booking.email,
    meetingName,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    displayTimezone: booking.guest_timezone || config.timezone,
    hostTimezone: config.timezone,
    manageUrl: payload.manageToken
      ? `${env.BASE_URL}/manage/${openSecret(payload.manageToken)}`
      : undefined,
    meetLink: payload.meetLink,
    bookAgainUrl: env.BASE_URL,
  };

  await sendEmail(renderers[payload.template](data));
}
