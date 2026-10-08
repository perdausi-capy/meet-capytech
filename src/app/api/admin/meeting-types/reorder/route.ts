import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { reorderMeetingTypes } from '@/lib/meeting-types';

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict();

export async function POST(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  reorderMeetingTypes(parsed.data.ids);
  return NextResponse.json({ success: true });
}
