import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  /**
   * Proxies in front of the API whose X-Forwarded-For entry is believed. 0 (the
   * default) ignores the header, which is right when clients connect directly.
   * Cloud Run sits behind exactly one Google front end, so it deploys with 1:
   * with 0 every request there shares the proxy's address, and the per-IP
   * limits (100 req/min, 30 sign-ins per 15 min) become one bucket for all
   * users that a single attacker can empty. Never set it above the real hop
   * count, or a client can choose its own address and slip every per-IP limit,
   * and only where clients cannot reach the container except through that proxy
   * (Cloud Run ingress), since a hop count cannot check who the peer is.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Mongo Atlas
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /** Which database on that server to use. Unset or empty: the one named in the URI. */
  MONGODB_DB: z
    .string()
    .optional()
    .transform((name) => name || undefined),

  // CORS: comma-separated list of allowed origins.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    // ASVS V3.4.2: a wildcard with credentials is an open door, so refuse it at
    // startup rather than trusting whoever edits the deployment config.
    .refine((origins) => origins.every((origin) => origin !== '*' && !origin.includes('*')), {
      message: 'CORS_ORIGINS must list explicit origins; wildcards are not allowed',
    }),

  // Check new passwords against the Have I Been Pwned range API (k-anonymity: only a 5-char
  // hash prefix leaves the server). Fails open if the service is unreachable.
  BREACHED_PASSWORD_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // Where the browser is sent after a successful OAuth callback.
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),

  // Disabled external channels leave the inbox fully usable.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_FROM: z.union([z.literal(''), z.string().email()]).default(''),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().default(''),
  LINE_CHANNEL_SECRET: z.string().default(''),
  LINE_OA_ID: z.string().default(''),
  // A separate scheduler calls the bounded worker in production. Timers are local only.
  NOTIFICATION_WORKER_TOKEN: z.union([z.literal(''), z.string().min(32)]).default(''),
  NOTIFICATION_POLL_MS: z.coerce.number().int().min(10000).default(60000),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_OAUTH_CALLBACK_URL: z.string().url(),

  // Google Cloud / Vertex AI
  GOOGLE_CLOUD_PROJECT: z.string().min(1, 'GOOGLE_CLOUD_PROJECT is required'),
  GOOGLE_CLOUD_LOCATION: z.string().default('asia-southeast1'),
  VERTEX_AI_MODEL: z.string().default('gemini-3.5-flash'),
  // Path to a service-account JSON key. ADC's own convention, and a path
  // rather than a value because the key contains a multi-line PEM.
  //
  // Leave this UNSET wherever you can. On Cloud Run the attached runtime
  // service account is picked up automatically, and setting this overrides it.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  // The service-account key as a *value* rather than a path: either the raw
  // JSON or the same JSON base64-encoded.
  //
  // This exists for containers. A container has no ~/.config/gcloud, so
  // `gcloud auth application-default login` does not reach it and a key file
  // would have to be baked in or bind-mounted. Takes precedence over ADC when
  // set; leave it unset on Cloud Run, which needs neither.
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // --- e-GP ingestion (Thai government procurement) ---
  // Open-data API key. Register at https://opend.data.go.th/register_api/
  EGP_API_KEY: z.string().min(1, 'EGP_API_KEY is required'),
  // Calls to the model (Gemini) in flight at once, across every project of a
  // Run. Vertex's quota and the bill count calls, so size this to the quota.
  // It also bounds the Archives held in memory waiting to be read.
  ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(8),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
