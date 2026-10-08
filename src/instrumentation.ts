export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { env } = await import('./env');
    const { getDb } = await import('./lib/db');
    const { logger } = await import('./lib/logger');
    const { isTurnstileEnabled } = await import('./lib/security/turnstile');
    getDb();

    if (env.NODE_ENV === 'production') {
      if (!isTurnstileEnabled()) {
        logger.warn('Turnstile is not configured: public bookings have no bot protection.');
      }
      if (process.env.MOCK_CALENDAR === '1') {
        logger.warn('MOCK_CALENDAR=1 in production: calendar availability is NOT being checked.');
      }
    }
  }
}
