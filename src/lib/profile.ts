import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';

/** Public host details shown on the booking page. Editable from the admin in M11. */
export interface HostProfile {
  name: string;
  title: string;
  company: string;
  bio: string;
  /** Absolute or site-relative image URL; initials are shown when absent. */
  avatarUrl: string | null;
  /** Shown on meeting type cards, e.g. "Google Meet". */
  location: string;
}

export const DEFAULT_PROFILE: HostProfile = {
  name: 'Jason',
  title: 'COO',
  company: 'Capytech UK',
  bio: 'Pick a time that suits you. You will get a calendar invite with a video link straight away.',
  avatarUrl: null,
  location: 'Google Meet',
};

export function getHostProfile(): HostProfile {
  try {
    const record = getDb().select().from(settings).where(eq(settings.key, 'profile')).get();
    if (record) {
      const { photoFile: _file, ...stored } = JSON.parse(record.value) as HostProfile & {
        photoFile?: string;
      };
      void _file;
      return { ...DEFAULT_PROFILE, ...stored };
    }
  } catch {
    // Fall back to defaults if the settings table is unavailable (e.g. during setup).
  }
  return DEFAULT_PROFILE;
}

/** Saves profile fields (avatarUrl is managed by the photo functions below). */
export function saveHostProfile(update: Partial<Omit<HostProfile, 'avatarUrl'>>): HostProfile {
  const next = { ...getHostProfile(), ...update };
  writeProfile({ ...next, photoFile: storedPhotoFile() });
  return next;
}

function writeProfile(profile: HostProfile & { photoFile?: string | null }) {
  const value = JSON.stringify(profile);
  const updated_at = new Date().toISOString();
  getDb()
    .insert(settings)
    .values({ key: 'profile', value, updated_at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updated_at } })
    .run();
}

/* ---------------- Photo ---------------- */

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const PHOTO_TYPES = [
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    test: (b: Buffer) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b: Buffer) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
] as const;

export class PhotoError extends Error {}

function uploadsDir() {
  return path.join(env.DATA_DIR, 'uploads');
}

function storedPhotoFile(): string | null {
  try {
    const record = getDb().select().from(settings).where(eq(settings.key, 'profile')).get();
    return record
      ? ((JSON.parse(record.value) as { photoFile?: string | null }).photoFile ?? null)
      : null;
  } catch {
    return null;
  }
}

/**
 * Stores a new host photo. The type is checked from the file's bytes (not its name or the
 * browser's claim), and the URL is versioned so browsers pick up the new picture immediately.
 */
export function saveHostPhoto(data: Buffer): HostProfile {
  if (data.length === 0) throw new PhotoError('The file is empty.');
  if (data.length > MAX_PHOTO_BYTES) throw new PhotoError('Please use an image under 3 MB.');
  const type = PHOTO_TYPES.find((t) => t.test(data));
  if (!type) throw new PhotoError('Please upload a JPEG, PNG or WebP image.');

  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const file = `avatar-${hash}.${type.ext}`;
  fs.mkdirSync(uploadsDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadsDir(), file), data);

  const previous = storedPhotoFile();
  const profile = {
    ...getHostProfile(),
    avatarUrl: `/api/profile/photo?v=${hash}`,
    photoFile: file,
  };
  writeProfile(profile);
  if (previous && previous !== file) fs.rmSync(path.join(uploadsDir(), previous), { force: true });
  return getHostProfile();
}

export function removeHostPhoto(): HostProfile {
  const previous = storedPhotoFile();
  writeProfile({ ...getHostProfile(), avatarUrl: null, photoFile: null });
  if (previous) fs.rmSync(path.join(uploadsDir(), previous), { force: true });
  return getHostProfile();
}

/** The current photo's bytes and type, for the public photo route. */
export function readHostPhoto(): { data: Buffer; mime: string } | null {
  const file = storedPhotoFile();
  if (!file || !/^avatar-[0-9a-f]{16}\.(jpg|png|webp)$/.test(file)) return null;
  const full = path.join(uploadsDir(), file);
  if (!fs.existsSync(full)) return null;
  const ext = file.split('.').pop();
  const mime = PHOTO_TYPES.find((t) => t.ext === ext)!.mime;
  return { data: fs.readFileSync(full), mime };
}
