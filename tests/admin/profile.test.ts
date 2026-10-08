import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { GET as GET_PROFILE, PUT as PUT_PROFILE } from '@/app/api/admin/profile/route';
import { DELETE as DELETE_PHOTO, POST as POST_PHOTO } from '@/app/api/admin/profile/photo/route';
import { GET as PUBLIC_PHOTO } from '@/app/api/profile/photo/route';
import { env } from '@/env';

// No session cookie in these tests (requests without a Bearer token are anonymous).
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

const auth = { Authorization: `Bearer ${env.ADMIN_TOKEN}` };

// Smallest valid PNG (1x1).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function upload(data: Buffer, type = 'image/png') {
  const form = new FormData();
  form.append('photo', new Blob([new Uint8Array(data)], { type }), 'photo.png');
  return POST_PHOTO(
    new Request('http://localhost/api/admin/profile/photo', {
      method: 'POST',
      headers: auth,
      body: form,
    }),
  );
}

describe('Host profile and photo', () => {
  beforeEach(() => {
    getDb().delete(settings).run();
  });

  afterEach(() => {
    getDb().delete(settings).run();
  });

  it('updates profile text and keeps the photo when doing so', async () => {
    expect((await upload(PNG)).status).toBe(200);
    const res = await PUT_PROFILE(
      new Request('http://localhost/api/admin/profile', {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jason Lee', bio: 'Hello there.' }),
      }),
    );
    expect(res.status).toBe(200);
    const { profile } = await (
      await GET_PROFILE(new Request('http://localhost', { headers: auth }))
    ).json();
    expect(profile).toMatchObject({ name: 'Jason Lee', bio: 'Hello there.' });
    expect(profile.avatarUrl).toMatch(/^\/api\/profile\/photo\?v=[0-9a-f]{16}$/);
    expect(profile.photoFile).toBeUndefined(); // internal file name is never exposed

    const photo = await PUBLIC_PHOTO();
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/png');
  });

  it('rejects files that are not really images, whatever they claim to be', async () => {
    const res = await upload(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png');
    expect(res.status).toBe(400);
  });

  it('removes the photo', async () => {
    await upload(PNG);
    await DELETE_PHOTO(new Request('http://localhost', { method: 'DELETE', headers: auth }));
    expect((await PUBLIC_PHOTO()).status).toBe(404);
  });

  it('requires the admin token', async () => {
    const res = await POST_PHOTO(
      new Request('http://localhost/api/admin/profile/photo', { method: 'POST' }),
    );
    expect(res.status).toBe(401);
  });
});
