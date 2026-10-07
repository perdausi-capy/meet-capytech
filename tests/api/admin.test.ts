import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET as GET_ADMIN_BOOKINGS } from '@/app/api/admin/bookings/route';
import { GET as GET_CONFIG, POST as POST_CONFIG } from '@/app/api/admin/config/route';
import { GET as GET_STATUS } from '@/app/api/admin/status/route';
import { getDb } from '@/lib/db';
import { bookings, settings } from '@/lib/db/schema';
import { env } from '@/env';

describe('M6 Host Admin API & Authentication', () => {
  const validHeader = { headers: new Headers({ Authorization: `Bearer ${env.ADMIN_TOKEN}` }) };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();

    db.insert(bookings)
      .values({
        id: 'admin-test-1',
        type_slug: 'intro',
        status: 'confirmed',
        starts_at: '2027-10-12T08:00:00.000Z',
        ends_at: '2027-10-12T08:15:00.000Z',
        name: 'Admin Guest',
        email: 'admin-guest@capytech.com',
        manage_token_hash: 'hash-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A9 - GET /api/admin/bookings supports since filter on updated_at', async () => {
    const req = new Request(
      'http://localhost:8080/api/admin/bookings?since=2027-10-01T00:00:00Z&limit=10',
      validHeader,
    );
    const res = await GET_ADMIN_BOOKINGS(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bookings[0].email).toBe('admin-guest@capytech.com');
  });

  it('A8 - POST /api/admin/config writes to DB and subsequent GET retrieves it', async () => {
    const postReq = new Request('http://localhost:8080/api/admin/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ minNoticeHours: 99 }),
    });

    const postRes = await POST_CONFIG(postReq);
    expect(postRes.status).toBe(200);

    const getReq = new Request('http://localhost:8080/api/admin/config', validHeader);
    const getRes = await GET_CONFIG(getReq);
    expect(getRes.status).toBe(200);

    const fetched = await getRes.json();
    expect(fetched.config.minNoticeHours).toBe(99);
  });
});
