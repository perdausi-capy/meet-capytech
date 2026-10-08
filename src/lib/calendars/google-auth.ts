import { google } from 'googleapis';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { google_tokens } from '@/lib/db/schema';
import { decryptToken, encryptToken } from '@/lib/security/crypto';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

// Refresh a little before Google's expiry so a token never dies mid-request.
const EXPIRY_MARGIN_MS = 60 * 1000;

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

    if (new Date(tokenRecord.expires_at).getTime() - Date.now() > EXPIRY_MARGIN_MS) {
      return decryptToken(tokenRecord.access_token_enc);
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: decryptToken(tokenRecord.refresh_token_enc) });

    const { token } = await oauth2Client.getAccessToken();
    if (!token) return null;

    const expiry = oauth2Client.credentials.expiry_date ?? Date.now() + 3600 * 1000;
    db.update(google_tokens)
      .set({
        access_token_enc: encryptToken(token),
        expires_at: new Date(expiry).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .where(eq(google_tokens.id, tokenRecord.id))
      .run();

    return token;
  } catch (err) {
    logger.error({ err }, 'Failed to refresh Google OAuth access token');
    return null;
  }
}
