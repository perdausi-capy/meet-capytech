import { google } from 'googleapis';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { google_tokens } from '@/lib/db/schema';
import { decryptToken, encryptToken } from '@/lib/security/crypto';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.BASE_URL}/api/admin/connect/callback`,
  );
}

export async function getValidAccessToken(): Promise<string | null> {
  try {
    const db = getDb();
    const tokenRecord = db.select().from(google_tokens).get();
    if (!tokenRecord) return null;

    const refreshToken = decryptToken(tokenRecord.refresh_token_enc);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { token } = await oauth2Client.getAccessToken();
    return token || null;
  } catch (err) {
    logger.error({ err }, 'Failed to refresh Google OAuth access token');
    return null;
  }
}
