import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env';
import type { LineFlexMessage } from './line-template';
import { DeliveryError } from './email';

export interface LineSender {
  push(to: string, text: string, retryKey: string, flex?: LineFlexMessage): Promise<void>;
  linkToken(userId: string): Promise<string>;
  reply(replyToken: string, text: string, flex?: LineFlexMessage): Promise<void>;
}

export function validLineSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createLineSender(
  env: Env,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): LineSender | null {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_CHANNEL_SECRET || !env.LINE_OA_ID) return null;
  const call = async (path: string, body?: unknown, retryKey?: string) => {
    let response: Response;
    try {
      response = await fetcher(`https://api.line.me/v2/bot/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          ...(retryKey ? { 'X-Line-Retry-Key': retryKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new DeliveryError('LINE connection timed out or failed', false);
    }
    if (response.status === 409 && retryKey && response.headers.has('x-line-accepted-request-id'))
      return {};
    if (!response.ok) {
      if (response.status === 429)
        throw new DeliveryError('LINE rate limit or monthly quota reached', false, 60 * 60 * 1000);
      throw new DeliveryError(
        `LINE rejected the request (${response.status})`,
        response.status < 500,
      );
    }
    return response.json() as Promise<Record<string, unknown>>;
  };
  return {
    async push(to, text, retryKey, flex) {
      await call(
        'message/push',
        { to, messages: [flex ?? { type: 'text', text: text.slice(0, 4900) }] },
        retryKey,
      );
    },
    async linkToken(userId) {
      const result = await call(`user/${encodeURIComponent(userId)}/linkToken`);
      if (typeof result.linkToken !== 'string')
        throw new DeliveryError('LINE returned no link token', false);
      return result.linkToken;
    },
    async reply(replyToken, text, flex) {
      await call('message/reply', { replyToken, messages: [flex ?? { type: 'text', text }] });
    },
  };
}
