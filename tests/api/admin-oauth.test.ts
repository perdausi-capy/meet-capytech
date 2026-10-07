import { describe, it, expect, vi } from 'vitest';
import { GET as CONNECT } from '@/app/api/admin/connect/route';
import { GET as CALLBACK } from '@/app/api/admin/connect/callback/route';
import * as googleAuthModule from '@/lib/calendars/google-auth';

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name === 'oauth_state' ? { value: 'valid-state-123' } : undefined),
    delete: vi.fn(),
  }),
}));

vi.mock('googleapis', () => ({
  google: {
    oauth2: () => ({
      userinfo: {
        get: vi.fn().mockResolvedValue({ data: { email: 'attacker@example.com' } }),
      },
    }),
  },
}));

describe('M6 Google OAuth Security', () => {
  it('A2 - GET /api/admin/connect without valid token returns 401', async () => {
    const req = new Request('http://localhost:8080/api/admin/connect?token=invalid');
    const res = await CONNECT(req);
    expect(res.status).toBe(401);
  });

  it('A2 - callback without valid state returns 400', async () => {
    const req = new Request(
      'http://localhost:8080/api/admin/connect/callback?code=abc&state=wrong-state',
    );
    const res = await CALLBACK(req);
    expect(res.status).toBe(400);
  });

  it('A2 - callback rejects account if email does not match HOST_EMAIL', async () => {
    vi.spyOn(googleAuthModule, 'getOAuth2Client').mockReturnValue({
      getToken: vi.fn().mockResolvedValue({ tokens: { refresh_token: 'r', access_token: 'a' } }),
      setCredentials: vi.fn(),
    } as any);

    const req = new Request(
      'http://localhost:8080/api/admin/connect/callback?code=abc&state=valid-state-123',
    );
    const res = await CALLBACK(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('You must sign in as the configured host');
  });
});
