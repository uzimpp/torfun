import nodemailer from 'nodemailer';
import type { Env } from '../../config/env';
import { escapeHtml } from './message';

export interface EmailSender {
  send(to: string, subject: string, text: string, id: string): Promise<void>;
}

/** Constructed only by app.ts. No credentials or transport errors leave this adapter. */
export function createEmailSender(env: Env): EmailSender | null {
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.NODE_ENV === 'production' && env.SMTP_PORT !== 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return {
    async send(to, subject, text, id) {
      try {
        const result = await transport.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html: `<div lang="th" style="font-family:sans-serif;line-height:1.7;max-width:640px">${text
            .split('\n')
            .map((line) => {
              const escaped = escapeHtml(line);
              return line.startsWith(`${new URL(env.WEB_APP_URL).origin}/`) && !/\s/.test(line)
                ? `<p><a href="${escaped}">เปิด Torfun</a></p>`
                : `<p>${escaped}</p>`;
            })
            .join('')}</div>`,
          messageId: `<${id}@${
            env.SMTP_FROM.split('@')
              .at(-1)
              ?.replace(/[^a-zA-Z0-9.-]/g, '') || 'torfun.local'
          }>`,
        });
        if (!result.accepted?.length) throw new DeliveryError('SMTP rejected the recipient', true);
      } catch (error) {
        if (error instanceof DeliveryError) throw error;
        const code = (error as { responseCode?: number }).responseCode;
        throw new DeliveryError(
          code && code >= 500
            ? 'SMTP permanently rejected this message'
            : 'SMTP connection or temporary rejection',
          Boolean(code && code >= 500),
        );
      }
    },
  };
}

export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
