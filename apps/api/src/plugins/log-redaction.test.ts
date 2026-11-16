import { describe, expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import pino from 'pino';
import { LOG_REDACTION } from '../core/log-redaction';

describe('log redaction', () => {
  test('credential-bearing fields never reach the sink', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ redact: LOG_REDACTION }, sink);

    logger.info(
      {
        req: { headers: { cookie: 'access=SECRET1', authorization: 'Bearer SECRET2' } },
        res: { headers: { 'set-cookie': 'refresh=SECRET3' } },
        body: { password: 'SECRET4', confirm_password: 'SECRET5' },
        session: { refreshToken: 'SECRET6', accessToken: 'SECRET7' },
      },
      'probe',
    );

    expect(lines.join('')).not.toMatch(/SECRET\d/);
    expect(lines.join('')).toContain('[redacted]');
  });
});
