import { createHmac, timingSafeEqual } from 'node:crypto';

const PATH = '/api/notifications/line/webhook';
const MAX_BODY = 1024 * 1024;

/** Development-only ingress. No other API routes, cookies or credentials are forwarded. */
export function startLineWebhookProxy(secret: string, port = 8787, apiPort = 8080) {
  if (!secret) throw new Error('LINE_CHANNEL_SECRET is required in the local environment');
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    maxRequestBodySize: MAX_BODY,
    idleTimeout: 20,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== PATH || url.search)
        return new Response('Not found', { status: 404 });
      const signature = request.headers.get('x-line-signature') ?? '';
      if (!/^[A-Za-z0-9+/]{43}=$/.test(signature))
        return new Response('Invalid signature', { status: 401 });
      const body = await request.arrayBuffer();
      const expected = createHmac('sha256', secret).update(Buffer.from(body)).digest();
      const received = Buffer.from(signature, 'base64');
      if (received.length !== expected.length || !timingSafeEqual(expected, received))
        return new Response('Invalid signature', { status: 401 });
      try {
        const upstream = await fetch(`http://127.0.0.1:${apiPort}${PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-line-signature': signature },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        });
        console.info(`LINE webhook forwarded: HTTP ${upstream.status}`);
        return new Response(await upstream.arrayBuffer(), {
          status: upstream.status,
          headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
        });
      } catch {
        return new Response('Local notification API unavailable', { status: 503 });
      }
    },
    error() {
      return new Response('Invalid webhook body', { status: 413 });
    },
  });
}

if (import.meta.main) {
  const port = Number(Bun.argv[2] ?? '8787');
  const apiPort = Number(Bun.argv[3] ?? '8080');
  if (![port, apiPort].every((value) => Number.isInteger(value) && value > 0 && value <= 65535))
    throw new Error('Usage: bun scripts/line-webhook-proxy.ts [proxy-port] [api-port]');
  const server = startLineWebhookProxy(process.env.LINE_CHANNEL_SECRET ?? '', port, apiPort);
  console.info(`LINE-only webhook ingress listening on ${server.url.origin}`);
  const stop = () => {
    server.stop(true);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
