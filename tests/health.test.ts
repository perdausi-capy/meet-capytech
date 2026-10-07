import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { migrateDb } from '@/lib/db/migrate';
import * as dbModule from '@/lib/db';

describe('Database and Health API', () => {
  beforeAll(() => {
    migrateDb();
  });

  beforeEach(() => {
    const db = getDb();
    db.delete(bookings).run();
  });

  it('returns 200 OK from health endpoint', async () => {
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.db).toBe('ok');
  });

  it('returns 503 when the DB is unavailable', async () => {
    vi.spyOn(dbModule, 'getDb').mockImplementation(() => {
      throw new Error('Simulated DB Error');
    });
    const res = await GET();
    expect(res.status).toBe(503);
    vi.restoreAllMocks();
  });

  it('prevents double bookings via unique index', async () => {
    const b1 = {
      id: 'uuid-1',
      type_slug: 'intro',
      starts_at: '2026-10-10T10:00:00Z',
      ends_at: '2026-10-10T10:15:00Z',
      name: 'Guest 1',
      email: 'g1@example.com',
      manage_token_hash: 'hash1',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      status: 'confirmed' as const,
    };
    const b2 = {
      ...b1,
      id: 'uuid-2',
      name: 'Guest 2',
      email: 'g2@example.com',
      manage_token_hash: 'hash2',
    };
    const b3 = {
      ...b1,
      id: 'uuid-3',
      name: 'Guest 3',
      manage_token_hash: 'hash3',
      status: 'cancelled' as const,
    };

    const db = getDb();
    db.insert(bookings).values(b1).run();
    expect(() => db.insert(bookings).values(b2).run()).toThrow(/UNIQUE constraint failed/);
    expect(() => db.insert(bookings).values(b3).run()).not.toThrow();
  });
});
