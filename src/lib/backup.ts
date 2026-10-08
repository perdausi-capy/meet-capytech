import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { env } from '@/env';
import { getSqlite } from '@/lib/db';
import { logger } from '@/lib/logger';

export function backupDir() {
  return path.join(env.DATA_DIR, 'backups');
}

/**
 * Writes a consistent online copy of the database to DATA_DIR/backups/booking-<date>.db and
 * deletes copies older than BACKUP_RETENTION_DAYS. These sit on the same disk, so the host
 * should also copy the backups folder off the server (see docs §4.7).
 */
export async function backupDatabase(now = new Date()): Promise<string> {
  fs.mkdirSync(backupDir(), { recursive: true });
  const file = path.join(backupDir(), `booking-${DateTime.fromJSDate(now).toUTC().toISODate()}.db`);
  const tmp = `${file}.partial`;

  await getSqlite().backup(tmp);
  fs.renameSync(tmp, file);

  const cutoff = now.getTime() - env.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(backupDir())) {
    const match = /^booking-(\d{4}-\d{2}-\d{2})\.db$/.exec(name);
    if (match && new Date(`${match[1]}T00:00:00Z`).getTime() < cutoff) {
      fs.rmSync(path.join(backupDir(), name));
    }
  }

  logger.info({ file }, 'Database backup written');
  return file;
}
