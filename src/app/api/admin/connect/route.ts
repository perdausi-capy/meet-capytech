import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/calendars/google-auth';
import { randomUUID } from 'node:crypto';
import { verifyAdminBearerToken } from '@/lib/security/auth';

export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json(
      { error: 'Unauthorized to initiate Google connection' },
      { status: 401 },
    );
  }

  const oauth2Client = getOAuth2Client();
  const state = randomUUID();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ],
    state,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/admin/connect',
  });

  return response;
}
