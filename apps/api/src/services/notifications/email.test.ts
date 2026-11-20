import { describe, expect, test } from 'bun:test';
import { createServer, type Socket } from 'node:net';
import { createEmailSender, DeliveryError } from './email';
import { testEnv } from '../../testing/env';

describe('SMTP adapter', () => {
  test('unconfigured SMTP is visibly unavailable', () => {
    expect(createEmailSender(testEnv())).toBeNull();
  });
  test('sends escaped HTML, plain text, links and a stable Message-ID over real local SMTP', async () => {
    let captured = '';
    const commands: string[] = [];
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.write('220 local.test ESMTP\r\n');
      let buffer = '';
      let inData = false;
      socket.on('data', (data) => {
        buffer += data.toString();
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          captured = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write('250 accepted\r\n');
        }
        while (!inData && buffer.includes('\r\n')) {
          const at = buffer.indexOf('\r\n');
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          commands.push(line);
          if (/^EHLO/i.test(line)) socket.write('250-local.test\r\n250 SIZE 1000000\r\n');
          else if (line === 'DATA') {
            inData = true;
            socket.write('354 send message\r\n');
          } else if (line === 'QUIT') {
            socket.end('221 bye\r\n');
          } else socket.write('250 ok\r\n');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No SMTP listener');
      const sender = createEmailSender(
        testEnv({
          NODE_ENV: 'test',
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: address.port,
          SMTP_FROM: 'sender@example.test',
        }),
      )!;
      await sender.send(
        'officer@example.test',
        'Test notification',
        '<script>unsafe</script>\nhttp://localhost:3000/tor/one',
        'stable-notification-id',
      );
      const mime = captured.replace(/=\r\n/g, '');
      expect(commands).toContain('MAIL FROM:<sender@example.test>');
      expect(commands).toContain('RCPT TO:<officer@example.test>');
      expect(mime).toContain('Message-ID: <stable-notification-id@example.test>');
      expect(mime).toContain('Content-Type: text/plain');
      expect(mime).toContain('Content-Type: text/html');
      expect(mime).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
      expect(mime).toContain('http://localhost:3000/tor/one');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  test('a broken SMTP connection is a sanitized transient failure', async () => {
    const sender = createEmailSender(
      testEnv({
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: 1,
        SMTP_FROM: 'sender@example.test',
        SMTP_PASSWORD: 'never-log-this-secret',
      }),
    )!;
    try {
      await sender.send('officer@example.test', 'Test', 'Text', 'id');
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryError);
      expect((error as DeliveryError).permanent).toBe(false);
      expect(String(error)).not.toContain('never-log-this-secret');
    }
  });
});
