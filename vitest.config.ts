import { defineConfig } from 'vitest/config';
import path from 'node:path';
import os from 'node:os';

// Tests write and wipe a database, so keep them away from ./data (the dev database).
const testDataDir = path.join(os.tmpdir(), `meet-capytech-test-${process.pid}`);
process.env.TEST_DATA_DIR = testDataDir;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    exclude: ['node_modules', 'dist', '.next', 'tests/e2e/**'],
    globalSetup: './tests/setup.ts',
    setupFiles: ['./tests/setup-each.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      DATA_DIR: testDataDir,
      BASE_URL: 'http://localhost:8080',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      HOST_EMAIL: 'host@capytech.com',
      ADMIN_TOKEN: 'test-admin-token-1234567890-capytech',
      VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
      TZ: 'UTC',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
