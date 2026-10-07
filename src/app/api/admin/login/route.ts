import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { env } from '@/env';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || !env.ADMIN_TOKEN) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const tokenBuffer = Buffer.from(token, 'utf8');
    const expectedBuffer = Buffer.from(env.ADMIN_TOKEN, 'utf8');

    if (
      tokenBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
    ) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set('admin_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/api/admin',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
