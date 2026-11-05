import { afterAll, beforeEach, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { startLineWebhookProxy } from './line-webhook-proxy';

const secret = 'local-test-signature-key';
const received: { body: string; cookie: string | null; authorization: string | null }[] = [];
const api = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    received.push({
      body: await request.text(),
      cookie: request.headers.get('cookie'),
      authorization: request.headers.get('authorization'),
    });
    return Response.json({ ok: true });
  },
});
const proxy = startLineWebhookProxy(secret, 0, api.port!);
const path = '/api/notifications/line/webhook';
const sign = (body: string) => createHmac('sha256', secret).update(body).digest('base64');
beforeEach(() => received.splice(0));
afterAll(() => {
  proxy.stop(true);
  api.stop(true);
});

test('preserves signed UTF-8 bytes while dropping cookies and authorization', async () => {
  const body = '{ "events": [], "example": "ทดสอบ" }\n';
  const result = await fetch(new URL(path, proxy.url), {
    method: 'POST',
    headers: {
      'x-line-signature': sign(body),
      cookie: 'private-cookie',
      authorization: 'private-authorization',
    },
    body,
  });
  expect(result.status).toBe(200);
  expect(received).toEqual([{ body, cookie: null, authorization: null }]);
});
test('never exposes other API routes or query variants, even with a valid signature', async () => {
  const body = '{"events":[]}';
  for (const url of ['/api/health', '/api/internal/notifications/run', path + '?redirect=1', '/']) {
    const response = await fetch(new URL(url, proxy.url), {
      method: 'POST',
      headers: { 'x-line-signature': sign(body) },
      body,
    });
    expect(response.status).toBe(404);
  }
  expect((await fetch(new URL(path, proxy.url))).status).toBe(404);
  expect(received).toHaveLength(0);
});
test('rejects missing, forged and altered signatures before reaching the API', async () => {
  const body = '{"events":[]}';
  for (const signature of ['', 'invalid', sign(body + ' '), sign(body).slice(1)]) {
    const response = await fetch(new URL(path, proxy.url), {
      method: 'POST',
      headers: { 'x-line-signature': signature },
      body,
    });
    expect(response.status).toBe(401);
  }
  expect(received).toHaveLength(0);
});
test('caps body size before forwarding', async () => {
  const body = 'x'.repeat(1024 * 1024 + 1);
  const response = await fetch(new URL(path, proxy.url), {
    method: 'POST',
    headers: { 'x-line-signature': sign(body) },
    body,
  });
  expect(response.status).toBe(413);
  expect(received).toHaveLength(0);
});
