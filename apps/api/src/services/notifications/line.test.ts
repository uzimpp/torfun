import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createLineSender, validLineSignature } from './line';
import { DeliveryError } from './email';
import { testEnv } from '../../testing/env';
const env = testEnv({
  LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
  LINE_CHANNEL_SECRET: 'test-secret',
  LINE_OA_ID: '@torfun',
});
describe('LINE protocol adapter', () => {
  test('signs against exact bytes including whitespace, rejecting altered or malformed signatures', () => {
    const body = '{ "events": [] }';
    const signature = createHmac('sha256', 'secret').update(body).digest('base64');
    expect(validLineSignature(body, signature, 'secret')).toBe(true);
    expect(validLineSignature('{"events":[]}', signature, 'secret')).toBe(false);
    expect(validLineSignature(body, 'bad', 'secret')).toBe(false);
  });
  test('push supplies a retry key on the first request and accepts only recognised duplicate responses', async () => {
    const requests: RequestInit[] = [];
    const fetcher = async (_url: unknown, options?: RequestInit) => {
      requests.push(options!);
      return new Response('{}', {
        status: 409,
        headers: { 'x-line-accepted-request-id': 'previous-request' },
      });
    };
    const sender = createLineSender(env, fetcher)!;
    await sender.push(`U${'1'.repeat(32)}`, 'Hello', 'same-key');
    expect(new Headers(requests[0]!.headers).get('X-Line-Retry-Key')).toBe('same-key');
    expect(JSON.parse(requests[0]!.body as string).messages[0].text).toBe('Hello');
  });
  test('quota and temporary failures back off; invalid recipients fail permanently', async () => {
    for (const [status, permanent] of [
      [429, false],
      [503, false],
      [400, true],
    ] as const) {
      const fetcher = async () => new Response('{}', { status });
      const sender = createLineSender(env, fetcher)!;
      try {
        await sender.push('user', 'message', 'key');
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(DeliveryError);
        expect((error as DeliveryError).permanent).toBe(permanent);
      }
    }
  });
});
