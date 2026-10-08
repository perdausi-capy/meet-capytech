import { google } from 'googleapis';
import { getOAuth2Client, getValidAccessToken } from '@/lib/calendars/google-auth';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { enqueueJob } from '@/lib/jobs/queue';

export const DELETE_EVENT_JOB = 'google.delete_event';

export interface CreateEventParams {
  title: string;
  description: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  guestName: string;
  guestEmail: string;
  useZoom?: boolean;
}

export async function createGoogleCalendarEvent(
  params: CreateEventParams,
): Promise<{ eventId: string; meetLink?: string }> {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    if (process.env.NODE_ENV === 'production' && process.env.MOCK_CALENDAR !== '1') {
      throw new Error('Google OAuth is not connected. Refusing to create unlinked reservation.');
    }
    logger.info('Google Calendar OAuth not connected; returning local reservation ID.');
    return { eventId: `local-${Date.now()}` };
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const location = params.useZoom && env.ZOOM_LINK ? env.ZOOM_LINK : undefined;

  const eventPayload: any = {
    summary: params.title,
    description: params.description,
    location,
    start: { dateTime: params.startsAt },
    end: { dateTime: params.endsAt },
    attendees: [{ email: params.guestEmail, displayName: params.guestName }],
    conferenceData: !location
      ? {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
      : undefined,
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: eventPayload,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
  });

  const eventId = response.data.id;
  if (!eventId) {
    throw new Error('Google Calendar API returned no event ID');
  }

  const meetLink = response.data.hangoutLink || undefined;
  return { eventId, meetLink };
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<boolean> {
  if (!eventId || eventId.startsWith('local-')) {
    return true;
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    if (process.env.NODE_ENV === 'production' && process.env.MOCK_CALENDAR !== '1') {
      throw new Error('Google OAuth is not connected. Cannot delete event.');
    }
    return true;
  }

  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });

    return true;
  } catch (err: any) {
    logger.error({ err, eventId }, 'Failed to delete Google Calendar event');
    throw err;
  }
}

/** Queues a Google event deletion that the job runner retries with backoff until it succeeds. */
export function queueEventDeletion(eventId: string) {
  enqueueJob(
    DELETE_EVENT_JOB,
    { eventId },
    { dedupeKey: `delete-event:${eventId}`, maxAttempts: 10 },
  );
}
