/**
 * pino `redact` settings shared by the app logger and its test.
 *
 * ASVS V16.2.5 / V14.1.1, threat T-11: credentials never reach the log sink,
 * even when a whole request, response or body object is logged.
 */
export const LOG_REDACTION = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    '*.password',
    '*.confirm_password',
    '*.passwordHash',
    '*.token',
    '*.refreshToken',
    '*.accessToken',
  ],
  censor: '[redacted]',
};
