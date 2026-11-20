/**
 * pino `redact` settings shared by the app logger and its test.
 *
 * ASVS V16.2.5 / V14.1.1, threat T-11: credentials never reach the log sink,
 * even when a whole request, response or body object is logged.
 */

/** Field names that carry a secret, in every spelling the API uses. */
const SECRET_FIELDS = [
  'password',
  'confirm_password',
  'current_password',
  'new_password',
  'passwordHash',
  'password_hash',
  'token',
  'refreshToken',
  'refresh_token',
  'accessToken',
  'access_token',
];

/**
 * Each secret field at the top level and up to two objects down, so
 * `password`, `body.password` and `req.body.password` are all covered.
 */
const secretPaths = SECRET_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]);

export const LOG_REDACTION = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    ...secretPaths,
  ],
  censor: '[redacted]',
};
