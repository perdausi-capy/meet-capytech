interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * - `read`: browsing availability / viewing a booking. Generous, since every day a guest
 *   clicks is one request and offices often share one IP.
 * - `write`: creating, cancelling or rescheduling. Strict, since each one can send a
 *   calendar invite from the host's account.
 */
export type RateLimitScope = 'read' | 'write';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP: Record<RateLimitScope, number> = { read: 120, write: 10 };
const MAX_PER_EMAIL = 3;

const ipLimits: Record<RateLimitScope, Map<string, RateLimitRecord>> = {
  read: new Map(),
  write: new Map(),
};
const emailLimits = new Map<string, RateLimitRecord>();

function cleanup() {
  const now = Date.now();
  for (const map of [ipLimits.read, ipLimits.write, emailLimits]) {
    for (const [k, v] of map.entries()) if (v.resetAt <= now) map.delete(k);
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

export function checkAndIncrementRateLimit(
  request: Request,
  email?: string,
  scope: RateLimitScope = 'write',
): { allowed: boolean; reason?: string } {
  cleanup();
  const now = Date.now();
  const ip = getClientIp(request);

  const ipMap = ipLimits[scope];
  const ipRecord = ipMap.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (ipRecord.count >= MAX_PER_IP[scope]) {
    return {
      allowed: false,
      reason: 'Too many requests from this IP address. Please try again later.',
    };
  }

  if (email) {
    const normalizedEmail = email.toLowerCase();
    const emailRecord = emailLimits.get(normalizedEmail) || { count: 0, resetAt: now + WINDOW_MS };
    if (emailRecord.count >= MAX_PER_EMAIL) {
      return {
        allowed: false,
        reason: 'Too many booking attempts for this email address. Please try again later.',
      };
    }
    emailRecord.count += 1;
    emailLimits.set(normalizedEmail, emailRecord);
  }

  ipRecord.count += 1;
  ipMap.set(ip, ipRecord);

  return { allowed: true };
}

export function resetRateLimitsForTests() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetRateLimitsForTests is only available in test');
  }
  ipLimits.read.clear();
  ipLimits.write.clear();
  emailLimits.clear();
}
