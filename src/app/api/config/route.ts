import { NextResponse } from 'next/server';
import { env } from '@/env';

export async function GET() {
  return NextResponse.json({
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
  });
}
