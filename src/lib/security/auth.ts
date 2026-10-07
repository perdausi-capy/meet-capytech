import crypto from 'node:crypto';
import { env } from '@/env';
import { cookies } from 'next/headers';

export async function verifyAdminBearerToken(request: Request): Promise<boolean> {
  let token = '';
  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get('admin_session')?.value || '';
  }

  if (!token || !env.ADMIN_TOKEN) return false;

  const tokenBuffer = Buffer.from(token, 'utf8');
  const expectedBuffer = Buffer.from(env.ADMIN_TOKEN, 'utf8');

  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}
