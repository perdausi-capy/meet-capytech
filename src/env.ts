import { z } from 'zod';

// Blank values and leftover `placeholder-*` values copied from .env.example count as "not set",
// so optional integrations stay disabled instead of failing with fake credentials.
const emptyToUndefined = (val: unknown) => {
  if (typeof val === 'string' && (val.trim() === '' || /placeholder/i.test(val))) return undefined;
  return val;
};

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DATA_DIR: z.preprocess(emptyToUndefined, z.string().default('./data')),
  ADMIN_TOKEN: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  ENCRYPTION_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'Must be 64 hex characters')
      .optional(),
  ),
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  HOST_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  BUSY_CALENDARS: z
    .string()
    .default('')
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
    ),
  ICS_FEEDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((x) => x.trim().replace(/^webcal:/i, 'https:'))
            .filter(Boolean)
        : [],
    ),
  ICS_BLOCK_ALL_DAY: z
    .enum(['0', '1'])
    .default('1')
    .transform((v) => v === '1'),
  ZOOM_LINK: z.preprocess(emptyToUndefined, z.string().url().optional()),
  TURNSTILE_SITE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  TURNSTILE_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Email over SMTP (Amazon SES London in production). Unset in development: emails go to
  // DATA_DIR/outbox as .eml files instead.
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_REPLY_TO: z.preprocess(emptyToUndefined, z.string().email().optional()),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(14),
});

const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['BASE_URL'],
        message: 'BASE_URL is required in production',
      });
    }
    if (!data.ADMIN_TOKEN || data.ADMIN_TOKEN.includes('placeholder')) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_TOKEN'],
        message: 'Valid ADMIN_TOKEN is required in production',
      });
    }
    if (
      !data.ENCRYPTION_KEY ||
      data.ENCRYPTION_KEY === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENCRYPTION_KEY'],
        message: 'Valid ENCRYPTION_KEY is required in production',
      });
    }
    if (Boolean(data.TURNSTILE_SECRET) !== Boolean(data.TURNSTILE_SITE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET'],
        message: 'Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET, or neither',
      });
    }
    if (data.SMTP_HOST && !data.EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'EMAIL_FROM is required when SMTP_HOST is configured',
      });
    }
    if (data.WEBHOOK_URL && !data.WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEBHOOK_SECRET'],
        message: 'WEBHOOK_SECRET is required when WEBHOOK_URL is configured in production',
      });
    }
  }
});

const isBuilding =
  process.env.npm_lifecycle_event === 'build' || process.env.SKIP_ENV_VALIDATION === '1';
const parsed = isBuilding ? baseEnvSchema.safeParse(process.env) : envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Invalid environment variables:\n',
    JSON.stringify(parsed.error.flatten(), null, 2),
  );
  process.exit(1);
  throw new Error('Invalid environment variables');
}

export const env = Object.freeze({
  ...(parsed.data as z.infer<typeof envSchema>),
  BASE_URL: parsed.data.BASE_URL ? parsed.data.BASE_URL : `http://localhost:${parsed.data.PORT}`,
});
