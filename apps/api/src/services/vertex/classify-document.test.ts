import { describe, expect, mock, test } from 'bun:test';
import {
  classifyTorDocument,
  MAX_INLINE_PDF_BYTES,
  type ModelCall,
  type OversizeReaders,
} from './classify-document';
import { ModelTimeoutError } from './reliable-model-call';

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

  test('stores the deadline as an ISO timestamp whatever format the model wrote it in', async () => {
    const withDeadline = (deadlineAt: string | null) =>
      classifyTorDocument(
        answering({ ...validAnswer, analysis: { ...validAnswer.analysis, deadlineAt } }),
        pdf(),
      );

    expect((await withDeadline('15 ต.ค. 69')).analysis?.deadlineAt).toBe(
      '2026-10-15T00:00:00.000Z',
    );
    expect((await withDeadline('2569-10-15')).analysis?.deadlineAt).toBe(
      '2026-10-15T00:00:00.000Z',
    );
    expect((await withDeadline('ภายใน 30 วัน')).analysis?.deadlineAt).toBeNull();
    expect((await withDeadline(null)).analysis?.deadlineAt).toBeNull();
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
    const result = await classifyTorDocument(
      mock(async () => 'ขออภัย ไม่สามารถอ่านได้'),
      pdf(),
    );

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

  test('a call that timed out is recorded as a timeout, not as a bad answer', async () => {
    const result = await classifyTorDocument(
      mock(async () => {
        throw new ModelTimeoutError(120_000);
      }),
      pdf(),
    );

    expect(result.isTor).toBe(false);
    expect(result.unreadable).toMatch(/timed out after 120s/i);
    expect(result.unreadable).not.toMatch(/JSON|schema/i);
  });

  describe('the procurement status the document shows', () => {
    test('is read from the answer', async () => {
      const result = await classifyTorDocument(
        answering({ ...validAnswer, procurementStatus: 'drafting' }),
        pdf(),
      );

      expect(result.procurementStatus).toBe('drafting');
    });

    test('is null when the document does not show a stage, or the model leaves it out', async () => {
      const explicit = await classifyTorDocument(
        answering({ ...validAnswer, procurementStatus: null }),
        pdf(),
      );
      const omitted = await classifyTorDocument(answering(validAnswer), pdf());

      expect(explicit.procurementStatus).toBeNull();
      expect(omitted.procurementStatus).toBeNull();
    });

    test('accepts only the six stages: unknown is what the system says, never the model', async () => {
      for (const value of ['unknown', 'invitation', 'จัดทำ TOR']) {
        const result = await classifyTorDocument(
          answering({ ...validAnswer, procurementStatus: value }),
          pdf(),
        );

        expect(result.unreadable).toMatch(/schema/i);
      }
    });

    test('the prompt names every stage the model may answer with, and tells it not to guess', async () => {
      let prompt = '';
      const call: ModelCall = async (parts) => {
        prompt = parts.prompt;
        return JSON.stringify(validAnswer);
      };
      await classifyTorDocument(call, pdf());

      for (const stage of [
        'drafting',
        'open',
        'evaluating',
        'awarded',
        'contracted',
        'cancelled',
      ]) {
        expect(prompt).toContain(stage);
      }
      expect(prompt).toContain('ห้ามเดา');
    });
  });

  test('claims a TOR but supplies no analysis — treated as unusable', async () => {
    const result = await classifyTorDocument(
      answering({ isTor: true, torKind: 'final', whatThisIs: 'TOR', analysis: null }),
      pdf(),
    );

    expect(result.unreadable).toBeDefined();
  });
});

describe('a document over the inline limit', () => {
  const big = () => pdf(MAX_INLINE_PDF_BYTES + 1);
  const readers = (overrides: Partial<OversizeReaders> = {}): OversizeReaders => ({
    extractText: async () => null,
    firstPages: async () => null,
    ...overrides,
  });
  const TEXT = 'ขอบเขตของงาน จ้างพัฒนาระบบสารสนเทศ '.repeat(40);

  test('with a usable text layer, the text is sent instead of the PDF, and the reading is marked partial', async () => {
    const callModel = answering(validAnswer);

    const result = await classifyTorDocument(
      callModel,
      big(),
      readers({ extractText: async () => TEXT }),
    );

    const sent = (callModel as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
      pdfBase64?: string;
      text?: string;
    };
    expect(sent.text).toBe(TEXT);
    expect(sent.pdfBase64).toBeUndefined();
    expect(result.readMode).toBe('text');
    expect(result.readNote).toMatch(/ข้อความ/);
    expect(result.isTor).toBe(true);
    // A reading from extracted text can have lost tables and scans; never "high".
    expect(result.analysis?.confidence).toBe('low');
  });

  test('with no text layer, the first pages are sent as a smaller PDF', async () => {
    const callModel = answering(validAnswer);
    const slice = pdf(2_000);

    const result = await classifyTorDocument(
      callModel,
      big(),
      readers({ firstPages: async () => ({ pdf: slice, pages: 30, totalPages: 120 }) }),
    );

    const sent = (callModel as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
      pdfBase64?: string;
    };
    expect(sent.pdfBase64).toBe(slice.toString('base64'));
    expect(result.readMode).toBe('first_pages');
    expect(result.readNote).toMatch(/30/);
    expect(result.readNote).toMatch(/120/);
    expect(result.analysis?.confidence).toBe('low');
  });

  test('the text layer is preferred to cutting pages off', async () => {
    const firstPages = mock(async () => ({ pdf: pdf(2_000), pages: 30, totalPages: 120 }));

    const result = await classifyTorDocument(
      answering(validAnswer),
      big(),
      readers({ extractText: async () => TEXT, firstPages }),
    );

    expect(result.readMode).toBe('text');
    expect(firstPages).not.toHaveBeenCalled();
  });

  test('when neither fallback works it is unreadable, with the reason, and the model is not called', async () => {
    const callModel = answering(validAnswer);

    const result = await classifyTorDocument(callModel, big(), readers());

    expect(result.unreadable).toMatch(/15MB/);
    expect(result.unreadable).toMatch(/text layer/i);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('a fallback that throws counts as unavailable, and the next one is tried', async () => {
    const result = await classifyTorDocument(
      answering(validAnswer),
      big(),
      readers({
        extractText: async () => {
          throw new Error('pdf.js could not open it');
        },
        firstPages: async () => ({ pdf: pdf(2_000), pages: 10, totalPages: 50 }),
      }),
    );

    expect(result.readMode).toBe('first_pages');
  });

  test('a normal-size document never touches the fallbacks', async () => {
    const extractText = mock(async () => TEXT);

    const result = await classifyTorDocument(
      answering(validAnswer),
      pdf(),
      readers({ extractText }),
    );

    expect(extractText).not.toHaveBeenCalled();
    expect(result.readMode).toBe('pdf');
    expect(result.analysis?.confidence).toBe('high');
  });
});
