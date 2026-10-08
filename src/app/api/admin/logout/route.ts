import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  // Must match the path the cookie was set with in /api/admin/login, or the browser keeps it.
  cookieStore.delete({ name: 'admin_session', path: '/api/admin' });
  return NextResponse.json({ success: true });
}
