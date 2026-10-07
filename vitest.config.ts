import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    exclude: ['node_modules', 'dist', '.next', 'tests/e2e/**'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
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
