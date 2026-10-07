import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { asc, gte, eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sinceParam = searchParams.get('since');
    const statusFilter = searchParams.get('status');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const conditions = [];

    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(bookings.updated_at, sinceDate.toISOString()));
      }
    }

    if (
      statusFilter &&
      ['confirmed', 'pending', 'cancelled', 'rescheduled'].includes(statusFilter)
    ) {
      const validStatus = statusFilter as 'confirmed' | 'pending' | 'cancelled' | 'rescheduled';
      conditions.push(eq(bookings.status, validStatus));
    }

    const db = getDb();
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = db
      .select()
      .from(bookings)
      .where(whereClause)
      .orderBy(asc(bookings.updated_at), asc(bookings.id))
      .limit(limit + 1)
      .offset(offset)
      .all();

    const hasMore = results.length > limit;
    const paginatedResults = hasMore ? results.slice(0, limit) : results;

    const formatted = paginatedResults.map((b) => ({
      id: b.id,
      typeSlug: b.type_slug,
      status: b.status,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      name: b.name,
      email: b.email,
      notes: b.notes,
      rescheduledTo: b.rescheduled_to,
      eventId: b.event_id,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
    }));

    return NextResponse.json({
      total: formatted.length,
      limit,
      offset,
      nextCursor: hasMore ? offset + limit : null,
      bookings: formatted,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch admin bookings list');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
