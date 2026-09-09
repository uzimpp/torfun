import { describe, expect, mock, test } from 'bun:test';
import { classifyTorDocument, MAX_INLINE_PDF_BYTES, type ModelCall } from './classify-document';

/** Bytes that pass the %PDF magic-number check, padded to a given length. */
const pdf = (bytes = 1_000) =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.max(0, bytes - 9), 0x20)]);

const answering = (body: unknown): ModelCall => mock(async () => JSON.stringify(body));

const validAnswer = {
  isTor: true,
  torKind: 'final',
  whatThisIs: 'ขอบเขตของงาน (TOR) จ้างพัฒนาระบบสารสนเทศ',
  analysis: {
    summary: 'จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน',
    scopeOfWork: ['พัฒนาเว็บแอปพลิเคชัน'],
    budgetThb: 4_500_000,
    deadlineAt: '2026-10-15',
    durationDays: 180,
    techStack: ['React', 'PostgreSQL'],
    targetPlatforms: ['web_app'],
    requiredQualifications: ['ผลงานภาครัฐย้อนหลัง 3 ปี'],
    isSoftwareProject: true,
    confidence: 'high',
  },
};

describe('classifyTorDocument', () => {
  test('reads a well-formed answer into a classification', async () => {
    const result = await classifyTorDocument(answering(validAnswer), pdf());

    expect(result.isTor).toBe(true);
    expect(result.torKind).toBe('final');
    expect(result.analysis?.budgetThb).toBe(4_500_000);
    expect(result.analysis?.techStack).toEqual(['React', 'PostgreSQL']);
    expect(result.unreadable).toBeUndefined();
  });

  test('accepts a document the model says is not a TOR', async () => {
    const result = await classifyTorDocument(
      answering({
        isTor: false,
        torKind: null,
        whatThisIs: 'หนังสือรับรองผู้รับจ้าง',
        analysis: null,
      }),
      pdf(),
    );

    expect(result.isTor).toBe(false);
    expect(result.analysis).toBeNull();
    expect(result.unreadable).toBeUndefined();
  });

  test('an oversized document is rejected without spending a call', async () => {
    const callModel = answering(validAnswer);
    const result = await classifyTorDocument(callModel, pdf(MAX_INLINE_PDF_BYTES + 1));

    expect(callModel).not.toHaveBeenCalled();
    expect(result.unreadable).toContain('15');
    expect(result.isTor).toBe(false);
  });

  test('bytes that are not a PDF are rejected without spending a call', async () => {
    const callModel = answering(validAnswer);
    const notAPdf = Buffer.from('<!doctype html><title>E4514</title>');
    const result = await classifyTorDocument(callModel, notAPdf);

    expect(callModel).not.toHaveBeenCalled();
    expect(result.unreadable).toBeDefined();
  });

  test('a malformed answer is recorded, never thrown', async () => {
    // The model is not an authority; it can return prose, truncated JSON, or a
    // refusal. None of those may take down a run.
    const result = await classifyTorDocument(mock(async () => 'ขออภัย ไม่สามารถอ่านได้'), pdf());

    expect(result.unreadable).toBeDefined();
    expect(result.isTor).toBe(false);
  });

  test('an answer missing required fields is recorded, never thrown', async () => {
    const result = await classifyTorDocument(answering({ isTor: true }), pdf());

    expect(result.unreadable).toBeDefined();
  });

  test('a model that throws is recorded, never thrown', async () => {
    const result = await classifyTorDocument(
      mock(async () => {
        throw new Error('429 Resource exhausted');
      }),
      pdf(),
    );

    expect(result.unreadable).toContain('429');
  });

  test('claims a TOR but supplies no analysis — treated as unusable', async () => {
    const result = await classifyTorDocument(
      answering({ isTor: true, torKind: 'final', whatThisIs: 'TOR', analysis: null }),
      pdf(),
    );

    expect(result.unreadable).toBeDefined();
  });
});
