import type { Db } from 'mongodb';
import type { Env } from '../config/env';
import { openDataGet } from './egp/client';
import { DEPT_URL } from './egp/constants';
import { createVertexAiClient } from './vertex/vertex-ai';

/**
 * Checks the external dependencies the API needs, and says which one is wrong.
 *
 * Deliberately NOT part of `/api/health`. That endpoint is a liveness probe and
 * must keep working with nothing else reachable — `buildApp()` is required to
 * build without a database. This makes real calls to Atlas, Vertex and the
 * open-data API, so it is admin-only and must never be wired to a container
 * health check: Vertex is billed per call, and a transient upstream blip would
 * take the container down with it.
 */

export interface DependencyProbe {
  name: string;
  /** Resolves with a human-readable detail, or throws with the reason. */
  check: () => Promise<string>;
}

export interface DependencyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticsResult {
  ok: boolean;
  checks: DependencyCheck[];
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class DiagnosticsService {
  constructor(
    private readonly probes: DependencyProbe[],
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  /**
   * Runs every probe, including the ones after a failure.
   *
   * Stopping at the first would leave an administrator guessing about the rest,
   * which is the situation this exists to end.
   */
  async run(): Promise<DiagnosticsResult> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const checks = await Promise.all(
      this.probes.map(async ({ name, check }): Promise<DependencyCheck> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const detail = await Promise.race([
            check(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
          ]);
          return { name, ok: true, detail };
        } catch (error) {
          return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );

    return { ok: checks.every((check) => check.ok), checks };
  }
}

/** Turns a raw failure into the thing an administrator actually needs to do. */
function explain(message: string, rules: [RegExp, string][]): string {
  return rules.find(([pattern]) => pattern.test(message))?.[1] ?? message.slice(0, 200);
}

/**
 * The real probes. Built here rather than in `app.ts`, which composes but does
 * not know how to talk to anything.
 */
export function createDependencyProbes(env: Env, getDb: () => Promise<Db>): DependencyProbe[] {
  return [
    {
      name: 'mongodb',
      check: async () => {
        try {
          const db = await getDb();
          await db.command({ ping: 1 });
          const collections = await db.listCollections().toArray();
          // The connection string naming no database is a real misconfiguration:
          // the driver silently falls back to one called `test`.
          const named = /mongodb(?:\+srv)?:\/\/[^/]+\/[^?]+/.test(env.MONGODB_URI);
          return `database ${db.databaseName}${named ? '' : ' (NOT named in MONGODB_URI — driver default)'}, ${collections.length} collections`;
        } catch (error) {
          throw new Error(
            explain(error instanceof Error ? error.message : String(error), [
              [/bad auth|Authentication failed/i, 'credentials rejected — check the database user and password in Atlas'],
              [/ServerSelection|ETIMEDOUT|querySrv/i, 'unreachable — check the Atlas Network Access IP allowlist'],
            ]),
          );
        }
      },
    },
    {
      name: 'vertex-ai',
      check: async () => {
        try {
          const response = await createVertexAiClient(env).models.generateContent({
            model: env.VERTEX_AI_MODEL,
            contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
            // Generous on purpose: this model thinks before it answers and
            // spends that thinking from the same budget. Too small returns "".
            config: { temperature: 0, maxOutputTokens: 512 },
          });
          const thoughts = response.usageMetadata?.thoughtsTokenCount ?? 0;
          return `${env.VERTEX_AI_MODEL} @ ${env.GOOGLE_CLOUD_LOCATION} replied ${JSON.stringify((response.text ?? '').trim())}${thoughts ? ` (+${thoughts} thinking tokens)` : ''}`;
        } catch (error) {
          throw new Error(
            explain(error instanceof Error ? error.message : String(error), [
              [/Could not load the default credentials|Unable to authenticate|Unable to detect a Project/i,
                'no usable credentials — run `gcloud auth application-default login`, or set GOOGLE_SERVICE_ACCOUNT_JSON in a container'],
              [/NOT_FOUND|was not found|is not supported/i,
                `"${env.VERTEX_AI_MODEL}" is not served in ${env.GOOGLE_CLOUD_LOCATION}`],
              [/PERMISSION_DENIED/i, 'authenticated, but the identity lacks roles/aiplatform.user on this project'],
            ]),
          );
        }
      },
    },
    {
      name: 'egp-open-data',
      check: async () => {
        // The tolerant public bulk API, not gprocurement.go.th — nothing here
        // touches the host that asked not to be crawled.
        const { rows } = await openDataGet<{ dept_code?: string }>(
          DEPT_URL,
          { dept_name: 'กรุงเทพมหานคร' },
          env.EGP_API_KEY,
        );
        return `${rows.length} dept rows returned`;
      },
    },
  ];
}
