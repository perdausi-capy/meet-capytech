import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getDb } from '@/lib/db';
import { google_tokens } from '@/lib/db/schema';
import { freeBusyStatusStore } from '@/lib/calendars/status-tracker';

export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }

  const db = getDb();
  const tokenRecord = db.select().from(google_tokens).get();

  const googleConnected = Boolean(tokenRecord);
  const isTokenExpired = tokenRecord ? new Date(tokenRecord.expires_at) < new Date() : true;

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    googleCalendar: {
      connected: googleConnected,
      email: tokenRecord?.email || null,
      tokenExpired: isTokenExpired,
      expiresAt: tokenRecord?.expires_at || null,
    },
    freeBusyService: {
      lastCheckAt: freeBusyStatusStore.lastCheckAt,
      lastError: freeBusyStatusStore.lastError,
      totalErrorsLogged: freeBusyStatusStore.errorCount,
    },
  });
}
