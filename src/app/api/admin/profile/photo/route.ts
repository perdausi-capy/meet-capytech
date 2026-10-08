import { NextResponse } from 'next/server';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { PhotoError, removeHostPhoto, saveHostPhoto } from '@/lib/profile';
import { logger } from '@/lib/logger';

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });

/** Upload a new host photo as multipart form data (field `photo`). */
export async function POST(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  try {
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No photo was attached.' }, { status: 400 });
    }
    const profile = saveHostPhoto(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof PhotoError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error({ err }, 'Failed to save host photo');
    return NextResponse.json({ error: 'Could not save the photo.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await verifyAdminBearerToken(request))) return unauthorized();
  return NextResponse.json({ profile: removeHostPhoto() });
}
