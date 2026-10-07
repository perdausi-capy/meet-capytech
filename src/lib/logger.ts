import pino from 'pino';
import { env } from '@/env';

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  redact: [
    'req.headers.authorization',
    '*.authorization',
    '*.token',
    '*.secret',
    '*.password',
    '*.key',
    'url',
    '*.url',
    'webhookUrl',
    '*.webhookUrl',
  ],
});
