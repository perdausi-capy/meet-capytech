import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './index';
import { logger } from '../logger';
import path from 'node:path';

export function migrateDb() {
  try {
    logger.info('Running database migrations...');
    const db = getDb();
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    logger.info('Database migrations applied successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Database migration failed');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDb();
}
