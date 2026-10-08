export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { env } = await import('./env');
    const { getDb } = await import('./lib/db');
    const { logger } = await import('./lib/logger');
    const { isTurnstileEnabled } = await import('./lib/security/turnstile');
    const { getEmailMode, outboxDir } = await import('./lib/email/send');
    const { startJobWorker } = await import('./lib/jobs/worker');
    getDb();

    const emailMode = getEmailMode();
    if (emailMode === 'outbox') {
      logger.info(
        { dir: outboxDir() },
        'No SMTP configured: emails are written to the local outbox',
      );
    }

    if (env.NODE_ENV === 'production') {
      if (!isTurnstileEnabled()) {
        logger.warn('Turnstile is not configured: public bookings have no bot protection.');
      }
      if (emailMode === 'disabled') {
        logger.warn('SMTP is not configured: confirmation and reschedule emails are not sent.');
      }
      if (process.env.MOCK_CALENDAR === '1') {
        logger.warn('MOCK_CALENDAR=1 in production: calendar availability is NOT being checked.');
      }
    }

    startJobWorker();
  }
}
