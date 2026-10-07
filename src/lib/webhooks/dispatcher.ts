import crypto from 'node:crypto';
import { env } from '@/env';
import { logger } from '@/lib/logger';

export type WebhookEvent = 'booking.created' | 'booking.cancelled' | 'booking.rescheduled';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  booking: {
    id: string;
    typeSlug: string;
    status: string;
    startsAt: string;
    endsAt: string;
    name: string;
    email: string;
    notes?: string | null;
  };
}

export async function dispatchWebhook(
  event: WebhookEvent,
  booking: WebhookPayload['booking'],
): Promise<boolean> {
  const webhookUrl = env.WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    booking,
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Meet-Capytech-Webhook/1.0',
  };

  if (env.WEBHOOK_SECRET) {
    const signature = crypto.createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
    headers['X-Capytech-Signature'] = `sha256=${signature}`;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status, webhookUrl },
        'Webhook endpoint responded with non-2xx status',
      );
      return false;
    }

    logger.info({ event, bookingId: booking.id }, 'Webhook event successfully dispatched');
    return true;
  } catch (err) {
    logger.error({ err, event, bookingId: booking.id }, 'Failed to dispatch webhook event');
    return false;
  }
}
