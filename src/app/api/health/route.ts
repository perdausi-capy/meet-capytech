import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    db.get(sql`SELECT 1`);
    return NextResponse.json(
      { ok: true, version: process.env.APP_VERSION || 'dev', db: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logger.error({ err: error }, 'Health check database failure');
    return NextResponse.json({ ok: false, db: 'error' }, { status: 503 });
  }
}
