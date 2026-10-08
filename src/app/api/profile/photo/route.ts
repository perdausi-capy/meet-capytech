import { readHostPhoto } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/** Public: the host's photo for the booking page. URLs carry a version, so cache them hard. */
export async function GET() {
  const photo = readHostPhoto();
  if (!photo) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
