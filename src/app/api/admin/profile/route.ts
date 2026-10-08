import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getHostProfile, saveHostProfile } from '@/lib/profile';

const profileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    title: z.string().trim().max(60),
    company: z.string().trim().max(80),
    bio: z.string().trim().max(400),
  })
  .partial()
  .strict();

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });

export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  return NextResponse.json({ profile: getHostProfile() });
}

export async function PUT(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid profile', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  return NextResponse.json({ profile: saveHostProfile(parsed.data) });
}
