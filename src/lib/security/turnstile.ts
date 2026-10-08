import { env } from '@/env';
import { logger } from '@/lib/logger';

/**
 * Turnstile is enforced only when BOTH keys are configured. With only one of them set,
 * the widget would never render (no site key) or every token would fail (no secret),
 * which blocks all bookings, so a half-configured setup is treated as disabled.
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY);
}

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<boolean> {
  if (!isTurnstileEnabled()) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', env.TURNSTILE_SECRET as string);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (!data.success) {
      logger.warn({ errorCodes: data['error-codes'] }, 'Turnstile token rejected');
    }
    return Boolean(data.success);
  } catch (err) {
    logger.error({ err }, 'Turnstile verification failed');
    return false;
  }
}
