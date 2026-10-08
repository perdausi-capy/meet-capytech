import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { cancelJobs, enqueueJob, registerJobHandler, runDueJobs } from '@/lib/jobs/queue';

const job = (id: string) => getDb().select().from(jobs).where(eq(jobs.id, id)).get()!;

describe('Background job queue', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T09:00:00Z'));
    getDb().delete(jobs).run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs due jobs and leaves future ones queued', async () => {
    const seen: unknown[] = [];
    registerJobHandler('test.collect', async (p) => {
      seen.push(p);
    });

    const now = enqueueJob('test.collect', { n: 1 })!;
    const later = enqueueJob(
      'test.collect',
      { n: 2 },
      { runAt: new Date('2027-10-01T10:00:00Z') },
    )!;

    expect(await runDueJobs()).toBe(1);
    expect(seen).toEqual([{ n: 1 }]);
    expect(job(now).status).toBe('done');
    expect(job(later).status).toBe('queued');

    vi.setSystemTime(new Date('2027-10-01T10:00:00Z'));
    await runDueJobs();
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('retries failures with backoff and gives up after max attempts', async () => {
    registerJobHandler('test.fail', async () => {
      throw new Error('boom');
    });
    const id = enqueueJob('test.fail', {}, { maxAttempts: 2 })!;

    await runDueJobs();
    expect(job(id)).toMatchObject({ status: 'queued', attempts: 1, last_error: 'boom' });
    expect(new Date(job(id).run_at).getTime()).toBe(Date.now() + 30_000);

    await runDueJobs(); // not due yet
    expect(job(id).attempts).toBe(1);

    vi.setSystemTime(new Date(Date.now() + 30_000));
    await runDueJobs();
    expect(job(id)).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('ignores a duplicate dedupe key while the first job is active, and allows cancelling', () => {
    expect(enqueueJob('test.collect', {}, { dedupeKey: 'reminder:b1:24h' })).toBeTruthy();
    expect(enqueueJob('test.collect', {}, { dedupeKey: 'reminder:b1:24h' })).toBeNull();
    expect(enqueueJob('test.collect', {}, { dedupeKey: 'reminder:b1:1h' })).toBeTruthy();

    expect(cancelJobs('reminder:b1:')).toBe(2);
    // Once cancelled, the key is free again.
    expect(enqueueJob('test.collect', {}, { dedupeKey: 'reminder:b1:24h' })).toBeTruthy();
  });

  it('requeues jobs stuck in "running" from a crashed process', async () => {
    const seen: string[] = [];
    registerJobHandler('test.stuck', async () => {
      seen.push('ran');
    });
    const id = enqueueJob('test.stuck', {})!;
    getDb()
      .update(jobs)
      .set({ status: 'running', locked_at: new Date(Date.now() - 11 * 60_000).toISOString() })
      .where(eq(jobs.id, id))
      .run();

    await runDueJobs();
    expect(seen).toEqual(['ran']);
    expect(job(id).status).toBe('done');
  });
});
