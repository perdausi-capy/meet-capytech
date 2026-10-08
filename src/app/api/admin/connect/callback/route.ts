import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import { getOAuth2Client } from '@/lib/calendars/google-auth';
import { getDb } from '@/lib/db';
import { google_tokens } from '@/lib/db/schema';
import { encryptToken } from '@/lib/security/crypto';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { randomUUID } from 'node:crypto';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get('oauth_state')?.value;

  if (!state || !stateCookie || state !== stateCookie) {
    return NextResponse.json({ error: 'Invalid or expired OAuth state' }, { status: 400 });
  }

  cookieStore.delete({ name: 'oauth_state', path: '/api/admin/connect' });

  if (!code) {
    return NextResponse.json({ error: 'Authorization code missing' }, { status: 400 });
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token || !tokens.access_token) {
      return NextResponse.json({ error: 'Failed to retrieve refresh token' }, { status: 400 });
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (userInfo.data.email !== env.HOST_EMAIL) {
      logger.warn(
        { attemptEmail: userInfo.data.email },
        'Unauthorized email attempted Google connect',
      );
      return NextResponse.json(
        { error: `You must sign in as the configured host (${env.HOST_EMAIL})` },
        { status: 403 },
      );
    }

    const db = getDb();
    const now = new Date().toISOString();

    db.transaction((tx) => {
      tx.delete(google_tokens).run();
      tx.insert(google_tokens)
        .values({
          id: randomUUID(),
          email: userInfo.data.email || env.HOST_EMAIL || 'host@capytech.com',
          refresh_token_enc: encryptToken(tokens.refresh_token as string),
          access_token_enc: encryptToken(tokens.access_token as string),
          expires_at: new Date(tokens.expiry_date || Date.now() + 3600000).toISOString(),
          updated_at: now,
        })
        .run();
    });

    logger.info('Google Calendar OAuth token connected and stored securely');

    return new NextResponse(
      '<html><body style="background:#000;color:#fff;font-family:monospace;padding:3rem;text-align:center;"><h2>Connection Successful!</h2><p>You can close this window now.</p><script>setTimeout(() => window.close(), 2000)</script></body></html>',
      { headers: { 'Content-Type': 'text/html' } },
    );
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback failure');
    return NextResponse.json({ error: 'OAuth exchange failed' }, { status: 500 });
  }
}
