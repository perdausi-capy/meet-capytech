import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '@/env';
import * as schema from './schema';
import { logger } from '@/lib/logger';

const globalForDb = globalThis as unknown as {
  _sqlite?: Database.Database;
  _db?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getDb() {
  if (!globalForDb._db) {
    if (!fs.existsSync(env.DATA_DIR)) {
      fs.mkdirSync(env.DATA_DIR, { recursive: true });
    }
    const sqlite = new Database(path.join(env.DATA_DIR, 'booking.db'));
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');

    const db = drizzle(sqlite, { schema });
    globalForDb._sqlite = sqlite;
    globalForDb._db = db;

    try {
      migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
      logger.info('Database migrations verified/applied.');
    } catch (error) {
      logger.error({ err: error }, 'Database migration failed');
      process.exit(1);
    }
  }
  return globalForDb._db;
}

/** The underlying better-sqlite3 handle, for things Drizzle doesn't wrap (e.g. online backups). */
export function getSqlite(): Database.Database {
  getDb();
  return globalForDb._sqlite as Database.Database;
}

export function closeDb() {
  if (globalForDb._sqlite) {
    globalForDb._sqlite.close();
  }
}
