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

  // Google Cloud / Vertex AI
  GOOGLE_CLOUD_PROJECT: z.string().min(1, 'GOOGLE_CLOUD_PROJECT is required'),
  GOOGLE_CLOUD_LOCATION: z.string().default('asia-southeast1'),
  VERTEX_AI_MODEL: z.string().default('gemini-2.0-flash'),
  // Path to a service-account JSON key. Prefer Workload Identity Federation
  // in deployed environments; this is for local development only.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // Notifications (USR-04/USR-05: email-only)
  SMTP_URL: z.string().optional(),
  NOTIFICATION_FROM_EMAIL: z.string().email().optional(),
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
