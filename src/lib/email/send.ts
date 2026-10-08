import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/env';
import { logger } from '@/lib/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailMode = 'smtp' | 'outbox' | 'disabled';

const DEFAULT_FROM = 'Capytech UK <no-reply@localhost>';

/**
 * - `smtp`: SMTP_HOST is set (Amazon SES London in production).
 * - `outbox`: development/test without SMTP; each email is written to DATA_DIR/outbox as a .eml
 *   file you can open in any mail client.
 * - `disabled`: production without SMTP; emails are skipped with a warning.
 */
export function getEmailMode(): EmailMode {
  if (env.SMTP_HOST) return 'smtp';
  return env.NODE_ENV === 'production' ? 'disabled' : 'outbox';
}

let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is implicit TLS; 587 upgrades with STARTTLS, which we require.
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT !== 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return smtpTransport;
}

export function outboxDir() {
  return path.join(env.DATA_DIR, 'outbox');
}

/** Sends an email. Throws on delivery failure so the job runner can retry it. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const mode = getEmailMode();
  const mail = {
    from: env.EMAIL_FROM || DEFAULT_FROM,
    replyTo: env.EMAIL_REPLY_TO,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  };

  if (mode === 'disabled') {
    logger.warn({ subject: message.subject }, 'Email not sent: SMTP is not configured');
    return;
  }

  if (mode === 'smtp') {
    const info = await getSmtpTransport().sendMail(mail);
    logger.info({ messageId: info.messageId, subject: message.subject }, 'Email sent');
    return;
  }

  const raw = await nodemailer
    .createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    .sendMail(mail);
  fs.mkdirSync(outboxDir(), { recursive: true });
  const slug = message.subject.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  const file = path.join(outboxDir(), `${Date.now()}-${randomUUID().slice(0, 8)}-${slug}.eml`);
  fs.writeFileSync(file, raw.message as Buffer);
  logger.info({ file }, 'Email written to local outbox (no SMTP configured)');
}
