import crypto from 'node:crypto';
import { env } from '@/env';

const ALGORITHM = 'aes-256-gcm';

export function encryptToken(text: string): string {
  if (!env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY not configured');
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(encryptedData: string): string {
  if (!env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY not configured');
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');

  if (!ivHex || !authTagHex || !encryptedText) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts a secret for storage in job payloads (e.g. a raw manage token for an email link).
 * Without ENCRYPTION_KEY, which only development allows, it is stored as-is with a marker.
 */
export function sealSecret(text: string): string {
  if (env.ENCRYPTION_KEY) return `enc:${encryptToken(text)}`;
  if (env.NODE_ENV === 'production') throw new Error('ENCRYPTION_KEY not configured');
  return `plain:${text}`;
}

export function openSecret(sealed: string): string {
  if (sealed.startsWith('enc:')) return decryptToken(sealed.slice(4));
  if (sealed.startsWith('plain:')) return sealed.slice(6);
  throw new Error('Unknown sealed secret format');
}
