import { DateTime } from 'luxon';
import { logger } from '@/lib/logger';
import { backupDatabase } from '@/lib/backup';
import { BOOKING_EMAIL_JOB, sendBookingEmail } from '@/lib/booking/notify';
import { DELETE_EVENT_JOB, deleteGoogleCalendarEvent } from '@/lib/booking/google-event';
import { deliverWebhook, WEBHOOK_JOB } from '@/lib/webhooks/dispatcher';
import { enqueueJob, pruneFinishedJobs, registerJobHandler, runDueJobs } from './queue';

export const BACKUP_JOB = 'backup.sqlite';

const TICK_MS = 10 * 1000;
const BACKUP_HOUR_LONDON = 3;

/** Queues the next nightly backup (03:00 London). One job per date, so re-queuing is harmless. */
export function scheduleNextBackup(now = new Date()) {
  let next = DateTime.fromJSDate(now)
    .setZone('Europe/London')
    .set({ hour: BACKUP_HOUR_LONDON, minute: 0, second: 0, millisecond: 0 });
  if (next.toJSDate() <= now) next = next.plus({ days: 1 });
  enqueueJob(BACKUP_JOB, {}, { runAt: next.toJSDate(), dedupeKey: `backup:${next.toISODate()}` });
}

export function registerAllJobHandlers() {
  registerJobHandler(BOOKING_EMAIL_JOB, sendBookingEmail);
  registerJobHandler(WEBHOOK_JOB, deliverWebhook);
  registerJobHandler(DELETE_EVENT_JOB, async ({ eventId }: { eventId: string }) => {
    await deleteGoogleCalendarEvent(eventId);
  });
  registerJobHandler(BACKUP_JOB, async () => {
    await backupDatabase();
    scheduleNextBackup();
  });
}

const globalForWorker = globalThis as unknown as { _jobWorker?: NodeJS.Timeout };

/** Starts the in-process job loop once per server process (survives dev hot reloads). */
export function startJobWorker() {
  if (globalForWorker._jobWorker) return;

  registerAllJobHandlers();
  scheduleNextBackup();

  let running = false;
  let ticks = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDueJobs();
      // Roughly hourly housekeeping.
      if (++ticks % 360 === 0) pruneFinishedJobs();
    } catch (err) {
      logger.error({ err }, 'Job worker tick failed');
    } finally {
      running = false;
    }
  };

  globalForWorker._jobWorker = setInterval(tick, TICK_MS);
  globalForWorker._jobWorker.unref();
  void tick();
  logger.info('Background job worker started');
}
