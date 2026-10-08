import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { bookings, jobs, settings } from '@/lib/db/schema';
import { POST as CREATE_BOOKING } from '@/app/api/bookings/route';
import { POST as CANCEL_BOOKING } from '@/app/api/manage/[token]/cancel/route';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import { registerAllJobHandlers } from '@/lib/jobs/worker';
import { runDueJobs } from '@/lib/jobs/queue';
import { outboxDir } from '@/lib/email/send';
import { bookingConfirmedEmail, escapeHtml, formatWhen } from '@/lib/email/templates';
import { backupDatabase, backupDir } from '@/lib/backup';

function readOutbox(): string[] {
  if (!fs.existsSync(outboxDir())) return [];
  return fs
    .readdirSync(outboxDir())
    .sort()
    .map((f) => decodeQuotedPrintable(fs.readFileSync(path.join(outboxDir(), f), 'utf8')));
}

/** Email bodies are quoted-printable: long lines are soft-wrapped and some bytes are =XX. */
function decodeQuotedPrintable(raw: string): string {
  return Buffer.from(
    raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => `%${hex}`),
    'utf8',
  )
    .toString()
    .replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

describe('Booking emails through the job runner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    resetRateLimitsForTests();
    registerAllJobHandlers();
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
    db.delete(jobs).run();
    fs.rmSync(outboxDir(), { recursive: true, force: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a confirmation with the manage link and guest-local time, then a cancellation', async () => {
    const res = await CREATE_BOOKING(
      new Request('http://localhost:8080/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          meetingType: 'intro',
          startTime: '2027-10-14T09:00:00.000Z',
          name: 'Aisha <Guest>',
          email: 'aisha@example.com',
          timezone: 'Asia/Dubai',
        }),
      }),
    );
    expect(res.status).toBe(201);
    const { manageToken } = await res.json();

    await runDueJobs();
    const [confirmation = ''] = readOutbox();
    expect(confirmation).toContain('To: aisha@example.com');
    expect(confirmation).toContain('Subject: Confirmed: Introductory Call on 14 Oct, 13:00');
    expect(confirmation).toContain(`/manage/${manageToken}`);
    expect(confirmation).toContain('Asia/Dubai');
    expect(confirmation).toContain('Aisha &lt;Guest&gt;'); // escaped in the HTML part

    // The raw manage token is not stored in plain text in the job payload.
    const payload = getDb().select().from(jobs).all()[0]!.payload;
    expect(payload).not.toContain(manageToken);

    const cancel = await CANCEL_BOOKING(
      new Request(`http://localhost:8080/api/manage/${manageToken}/cancel`, { method: 'POST' }),
      { params: Promise.resolve({ token: manageToken }) },
    );
    expect(cancel.status).toBe(200);

    await runDueJobs();
    const emails = readOutbox();
    expect(emails).toHaveLength(2);
    expect(emails.some((e) => e.includes('Subject: Cancelled: Introductory Call'))).toBe(true);
  });
});

describe('Email templates', () => {
  it('escapes guest-supplied text', () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
  });

  it('shows host time too when the guest is in another zone', () => {
    const email = bookingConfirmedEmail({
      guestName: 'G',
      guestEmail: 'g@example.com',
      meetingName: 'Intro',
      startsAt: '2027-10-14T09:00:00.000Z',
      endsAt: '2027-10-14T09:15:00.000Z',
      displayTimezone: 'Asia/Dubai',
      hostTimezone: 'Europe/London',
      bookAgainUrl: 'http://localhost:8080',
    });
    expect(email.text).toContain(
      formatWhen('2027-10-14T09:00:00.000Z', '2027-10-14T09:15:00.000Z', 'Asia/Dubai'),
    );
    expect(email.text).toContain(
      'Host time: Thursday 14 October 2027 · 10:00–10:15 (Europe/London)',
    );
  });
});

describe('Database backups', () => {
  it('writes a dated, readable copy and prunes ones past retention', async () => {
    fs.mkdirSync(backupDir(), { recursive: true });
    const old = path.join(backupDir(), 'booking-2020-01-01.db');
    fs.writeFileSync(old, 'old');

    const file = await backupDatabase(new Date('2027-10-01T02:00:00Z'));
    expect(path.basename(file)).toBe('booking-2027-10-01.db');
    expect(fs.readFileSync(file).subarray(0, 15).toString()).toBe('SQLite format 3');
    expect(fs.existsSync(old)).toBe(false);
  });
});
