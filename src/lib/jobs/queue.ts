import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, like, lt, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { logger } from '@/lib/logger';

export type JobHandler = (payload: any) => Promise<void>;

const handlers = new Map<string, JobHandler>();

const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
// A job still "running" after this long belongs to a process that died mid-run.
const STUCK_AFTER_MS = 10 * 60 * 1000;
const KEEP_FINISHED_MS = 30 * 24 * 60 * 60 * 1000;

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export interface EnqueueOptions {
  runAt?: Date;
  /** Only one queued/running job may hold a key; a duplicate enqueue is ignored. */
  dedupeKey?: string;
  maxAttempts?: number;
}

/** Queues a job and returns its id, or null when an active job already holds the dedupe key. */
export function enqueueJob(
  type: string,
  payload: unknown,
  opts: EnqueueOptions = {},
): string | null {
  const now = new Date().toISOString();
  const id = randomUUID();
  const result = getDb()
    .insert(jobs)
    .values({
      id,
      type,
      payload: JSON.stringify(payload ?? {}),
      run_at: (opts.runAt ?? new Date()).toISOString(),
      max_attempts: opts.maxAttempts ?? 5,
      dedupe_key: opts.dedupeKey ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
    .run();
  return result.changes === 1 ? id : null;
}

/** Cancels queued jobs whose dedupe key starts with the prefix (e.g. a booking's reminders). */
export function cancelJobs(dedupeKeyPrefix: string): number {
  // Keys are built by this app from fixed words, ids and colons, so no LIKE escaping is needed.
  return getDb()
    .update(jobs)
    .set({ status: 'cancelled', updated_at: new Date().toISOString() })
    .where(and(eq(jobs.status, 'queued'), like(jobs.dedupe_key, `${dedupeKeyPrefix}%`)))
    .run().changes;
}

function backoffMs(attempts: number) {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

/** Atomically marks up to `limit` due jobs as running so no other tick picks them up. */
function claimDueJobs(limit: number) {
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  return db.transaction(
    (tx) => {
      tx.update(jobs)
        .set({ status: 'queued', locked_at: null, updated_at: nowIso })
        .where(
          and(
            eq(jobs.status, 'running'),
            lt(jobs.locked_at, new Date(now.getTime() - STUCK_AFTER_MS).toISOString()),
          ),
        )
        .run();

      const due = tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), lte(jobs.run_at, nowIso)))
        .orderBy(asc(jobs.run_at))
        .limit(limit)
        .all();

      for (const job of due) {
        tx.update(jobs)
          .set({
            status: 'running',
            locked_at: nowIso,
            attempts: job.attempts + 1,
            updated_at: nowIso,
          })
          .where(eq(jobs.id, job.id))
          .run();
      }
      return due.map((j) => ({ ...j, attempts: j.attempts + 1 }));
    },
    { behavior: 'immediate' },
  );
}

/** Runs every job that is due now. Returns how many ran. */
export async function runDueJobs(limit = 20): Promise<number> {
  const db = getDb();
  const claimed = claimDueJobs(limit);

  for (const job of claimed) {
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      await handler(JSON.parse(job.payload));
      db.update(jobs)
        .set({
          status: 'done',
          locked_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .where(eq(jobs.id, job.id))
        .run();
    } catch (err: any) {
      const giveUp = job.attempts >= job.max_attempts;
      const message = String(err?.message || err).slice(0, 1000);
      db.update(jobs)
        .set({
          status: giveUp ? 'failed' : 'queued',
          locked_at: null,
          last_error: message,
          run_at: giveUp
            ? job.run_at
            : new Date(Date.now() + backoffMs(job.attempts)).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .where(eq(jobs.id, job.id))
        .run();
      const log = giveUp ? logger.error.bind(logger) : logger.warn.bind(logger);
      log(
        { jobId: job.id, type: job.type, attempts: job.attempts, err: message },
        giveUp ? 'Job failed permanently' : 'Job failed; will retry',
      );
    }
  }

  return claimed.length;
}

/** Deletes finished jobs older than 30 days so the table stays small. */
export function pruneFinishedJobs() {
  getDb()
    .delete(jobs)
    .where(
      and(
        inArray(jobs.status, ['done', 'cancelled']),
        lt(jobs.updated_at, new Date(Date.now() - KEEP_FINISHED_MS).toISOString()),
      ),
    )
    .run();
}
