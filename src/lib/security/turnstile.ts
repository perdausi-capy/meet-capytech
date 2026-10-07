import { env } from '@/env';
import { logger } from '@/lib/logger';

export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<boolean> {
  // If site key/secret aren't configured (e.g. in development/testing), bypass check
  if (!env.TURNSTILE_SECRET) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', env.TURNSTILE_SECRET);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    logger.error({ err }, 'Turnstile verification failed');
    return false;
  }
}
