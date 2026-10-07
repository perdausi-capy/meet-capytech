interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipLimits = new Map<string, RateLimitRecord>();
const emailLimits = new Map<string, RateLimitRecord>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 3;

function cleanup() {
  const now = Date.now();
  for (const [k, v] of ipLimits.entries()) if (v.resetAt <= now) ipLimits.delete(k);
  for (const [k, v] of emailLimits.entries()) if (v.resetAt <= now) emailLimits.delete(k);
}

export function checkAndIncrementRateLimit(
  request: Request,
  email?: string,
): { allowed: boolean; reason?: string } {
  cleanup();
  const now = Date.now();

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1';

  const ipRecord = ipLimits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (ipRecord.count >= MAX_PER_IP) {
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
  ipLimits.set(ip, ipRecord);

  return { allowed: true };
}

export function resetRateLimitsForTests() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetRateLimitsForTests is only available in test');
  }
  ipLimits.clear();
  emailLimits.clear();
}
