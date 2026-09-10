import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type { Env } from '../../config/env';
import type { ModelCall } from './classify-document';

/**
 * Vertex AI adapter: the one place that knows about Google's client.
 *
 * Uses the Google Gen AI SDK rather than `@google-cloud/vertexai`, which is
 * deprecated and past its stated removal date.
 *
 * `classifyTorDocument` takes a `ModelCall` rather than this client, so the
 * classification contract — schema validation, the size guard, failure
 * handling — is testable without a network or a credential. This module only
 * has to make a real call and hand back the text.
 */
/**
 * Credentials passed as a value rather than found on disk, when configured.
 *
 * Application Default Credentials resolve from the metadata server on Cloud
 * Run and from `~/.config/gcloud` on a developer's machine — but a container
 * has neither, so `docker compose up` has no way to authenticate without
 * either bind-mounting a key or being handed one. This is that second option.
 *
 * Accepts raw JSON or base64 of the same, because a key's multi-line PEM does
 * not survive a `.env` file intact.
 */
export function credentialsFromEnv(env: Env) {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;

  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');

  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is neither JSON nor base64-encoded JSON. ' +
        'Use the whole service-account key file as its value.',
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON parsed, but has no client_email/private_key — ' +
        'it does not look like a service-account key.',
    );
  }

  return { credentials: parsed };
}

export function createVertexAiClient(env: Env) {
  const googleAuthOptions = credentialsFromEnv(env);
  return new GoogleGenAI({
    vertexai: true,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION,
    // Omitted entirely when unset, so ADC still resolves the Cloud Run runtime
    // service account exactly as before.
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  });
}

const stringList: Schema = { type: Type.ARRAY, items: { type: Type.STRING } };

/**
 * The shape the model must answer in, enforced by the API rather than asked
 * for in the prompt.
 *
 * It mirrors the zod `AnswerSchema` in `classify-document.ts`, which still
 * validates what comes back — this makes a mismatch unlikely, not impossible,
 * and a model is not a contract. Every field a TOR might not state is
 * `nullable`, so "not in the document" has somewhere to go other than a
 * fabricated value.
 */
const ANSWER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    isTor: { type: Type.BOOLEAN },
    torKind: { type: Type.STRING, enum: ['final', 'draft'], nullable: true },
    whatThisIs: { type: Type.STRING },
    analysis: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        summary: { type: Type.STRING },
        scopeOfWork: stringList,
        budgetThb: { type: Type.NUMBER, nullable: true },
        deadlineAt: { type: Type.STRING, nullable: true },
        durationDays: { type: Type.INTEGER, nullable: true },
        techStack: stringList,
        targetPlatforms: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: ['macos', 'windows', 'mobile', 'web_app', 'other'],
          },
        },
        requiredQualifications: stringList,
        isSoftwareProject: { type: Type.BOOLEAN },
        confidence: { type: Type.STRING, enum: ['high', 'low'] },
      },
      required: [
        'summary',
        'scopeOfWork',
        'budgetThb',
        'deadlineAt',
        'durationDays',
        'techStack',
        'targetPlatforms',
        'requiredQualifications',
        'isSoftwareProject',
        'confidence',
      ],
    },
  },
  required: ['isTor', 'torKind', 'whatThisIs', 'analysis'],
};

/**
 * Ceiling on one answer, thinking included.
 *
 * `gemini-3.5-flash` reasons before it replies and charges that reasoning to
 * the same budget as the answer — 77 thinking tokens to reply "ok", and far
 * more for a 30-page Thai TOR. A budget sized for the JSON alone truncates
 * mid-thought and returns nothing. Output tokens are billed as used, so a high
 * ceiling costs nothing extra; too low a one costs the whole document.
 */
const MAX_OUTPUT_TOKENS = 16_384;

interface ModelResponse {
  text?: string;
  candidates?: { finishReason?: string }[];
  usageMetadata?: { thoughtsTokenCount?: number };
}

/**
 * The answer text, or an error saying precisely why there is none.
 *
 * Separated from the call so the failure modes are testable without a network,
 * and because an empty string returned quietly here becomes "the model did not
 * return JSON" three layers up — which blames the model for a budget.
 */
export function textFromResponse(response: ModelResponse): string {
  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error('Model returned no candidates.');

  const { finishReason } = candidate;
  if (finishReason === 'MAX_TOKENS') {
    const thoughts = response.usageMetadata?.thoughtsTokenCount;
    throw new Error(
      thoughts
        ? `Answer truncated: thinking used ${thoughts} tokens of the ${MAX_OUTPUT_TOKENS} maxOutputTokens budget before the answer was finished.`
        : `Answer truncated at the ${MAX_OUTPUT_TOKENS}-token maxOutputTokens budget.`,
    );
  }

  const text = response.text ?? '';
  if (!text.trim()) {
    throw new Error(`Model returned empty text (finishReason ${finishReason ?? 'unknown'}).`);
  }
  return text;
}

/**
 * Builds the model call the classification step uses.
 *
 * The PDF travels as base64 `inlineData` because nothing is stored (ADR-0002),
 * which is also why one document goes per call. `responseSchema` makes the API
 * enforce the answer's shape instead of the prompt merely requesting it, and
 * `temperature: 0` because this is a classification, not a composition.
 */
export function createModelCall(env: Env): ModelCall {
  const client = createVertexAiClient(env);

  return async ({ pdfBase64, prompt }) => {
    const response = await client.models.generateContent({
      model: env.VERTEX_AI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseSchema: ANSWER_SCHEMA,
      },
    });

    return textFromResponse(response);
  };
}
