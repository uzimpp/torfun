import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Mongo Atlas
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // CORS: comma-separated list of allowed origins.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_OAUTH_CALLBACK_URL: z.string().url(),

  // Google Cloud / Vertex AI
  GOOGLE_CLOUD_PROJECT: z.string().min(1, 'GOOGLE_CLOUD_PROJECT is required'),
  GOOGLE_CLOUD_LOCATION: z.string().default('asia-southeast3'),
  VERTEX_AI_MODEL: z.string().default('gemini-3.5-flash'),
  // Path to a service-account JSON key. Prefer Workload Identity Federation
  // in deployed environments; this is for local development only.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // --- e-GP ingestion (Thai government procurement) ---
  // Open-data API key. Register at https://opend.data.go.th/register_api/
  EGP_API_KEY: z.string().min(1, 'EGP_API_KEY is required'),
  // Per-run cap on TOR retrievals. gprocurement.go.th's robots.txt is
  // Disallow: / and the owner's authorisation is for low-volume research.
  EGP_MAX_DOWNLOADS_PER_RUN: z.coerce.number().int().positive().max(200).default(15),
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
