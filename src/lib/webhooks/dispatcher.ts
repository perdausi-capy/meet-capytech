import crypto from 'node:crypto';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { enqueueJob } from '@/lib/jobs/queue';

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

export const WEBHOOK_JOB = 'webhook.deliver';

/**
 * Queues a webhook for delivery. Delivery runs in the background job runner and is retried
 * with backoff if the CRM is down. `timestamp` is when the change happened, not when delivered.
 */
export function queueWebhook(event: WebhookEvent, booking: WebhookPayload['booking']): void {
  if (!env.WEBHOOK_URL) return;
  const payload: WebhookPayload = { event, timestamp: new Date().toISOString(), booking };
  enqueueJob(WEBHOOK_JOB, payload, { maxAttempts: 8 });
}

/** Sends one webhook. Throws on failure so the job runner retries it. */
export async function deliverWebhook(payload: WebhookPayload): Promise<void> {
  const webhookUrl = env.WEBHOOK_URL;
  if (!webhookUrl) return;

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Meet-Capytech-Webhook/1.0',
  };

  if (env.WEBHOOK_SECRET) {
    const signature = crypto.createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
    headers['X-Capytech-Signature'] = `sha256=${signature}`;
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Webhook endpoint responded with ${res.status}`);
  }

  logger.info(
    { event: payload.event, bookingId: payload.booking.id },
    'Webhook event successfully dispatched',
  );
}
