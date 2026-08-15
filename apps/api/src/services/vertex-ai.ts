import { VertexAI } from '@google-cloud/vertexai';
import type { Env } from '../config/env';

/**
 * Thin Vertex AI wrapper. Deliberately minimal: the actual TOR-reading
 * pipeline (native PDF understanding vs. a separate OCR step, prompt
 * design, structured-output schema for extracted fields) is still an
 * open decision. This just gets a working client and one example call
 * wired up so that decision has somewhere to land.
 */
export function createVertexAiClient(env: Env) {
  return new VertexAI({
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.GOOGLE_CLOUD_LOCATION,
  });
}

/**
 * Example: summarize a TOR PDF directly from bytes using Gemini's native
 * document understanding (no separate OCR step). Gemini models on Vertex AI
 * accept inline PDF data up to 20MB; larger files should go through Cloud
 * Storage + fileUri instead of inlineData.
 */
export async function summarizeTorDocument(
  env: Env,
  pdfBytes: Buffer,
  prompt = 'สรุปสาระสำคัญของเอกสาร TOR นี้เป็นภาษาไทย โดยระบุงบประมาณ กำหนดส่งงาน และ Tech Stack ที่ต้องการ',
) {
  const client = createVertexAiClient(env);
  const model = client.getGenerativeModel({ model: env.VERTEX_AI_MODEL });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBytes.toString('base64') } },
          { text: prompt },
        ],
      },
    ],
  });

  return result.response.candidates?.[0]?.content.parts.map((part) => part.text).join('') ?? '';
}
