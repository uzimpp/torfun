import { describe, expect, mock, test } from 'bun:test';
import { MAX_INLINE_PDF_BYTES, type ModelCall } from './classify-document';
import { readInvitationPdf } from './invitation-reader';

const pdf = (bytes = 1_000) =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.max(0, bytes - 9), 0x20)]);

const answering = (body: unknown): ModelCall => mock(async () => JSON.stringify(body));

describe('readInvitationPdf', () => {
  test('reads the bid date, converting a Buddhist-era date and keeping a stated time', async () => {
    const result = await readInvitationPdf(answering({ bidDate: '2569-10-20 16:30' }), pdf());

    expect(result).toEqual({ bidAt: '2026-10-20T09:30:00.000Z' });
  });

  test('a bid date the invitation does not state stays null', async () => {
    const result = await readInvitationPdf(answering({ bidDate: null }), pdf());

    expect(result).toEqual({ bidAt: null });
  });

  test('a date it cannot turn into a calendar day is null, not a guess', async () => {
    const result = await readInvitationPdf(answering({ bidDate: 'ภายใน 30 วัน' }), pdf());

    expect(result.bidAt).toBeNull();
    expect(result.unreadable).toBeUndefined();
  });

  test('asks for the invitation schema, with the PDF', async () => {
    const callModel = answering({ bidDate: null });
    await readInvitationPdf(callModel, pdf());

    const call = (callModel as ReturnType<typeof mock>).mock
      .calls[0]![0] as Parameters<ModelCall>[0];
    expect(call.answer).toBe('invitation');
    expect(call.pdfBase64).toBe(pdf().toString('base64'));
  });

  test('bytes that are not a PDF are unreadable and the model is not called', async () => {
    const callModel = answering({});
    const result = await readInvitationPdf(callModel, Buffer.from('<html>not a pdf</html>'));

    expect(result.unreadable).toContain('%PDF');
    expect(callModel).not.toHaveBeenCalled();
  });

  test('a PDF over the inline limit is unreadable', async () => {
    const result = await readInvitationPdf(answering({}), pdf(MAX_INLINE_PDF_BYTES + 1));

    expect(result.unreadable).toBeDefined();
  });

  test('a failed call, non-JSON or a wrong shape is unreadable with the reason', async () => {
    const failing: ModelCall = async () => {
      throw new Error('503 busy');
    };
    expect((await readInvitationPdf(failing, pdf())).unreadable).toBe('503 busy');
    expect((await readInvitationPdf(async () => 'nope', pdf())).unreadable).toContain('JSON');
    expect((await readInvitationPdf(answering({ bidDate: 5 }), pdf())).unreadable).toContain(
      'schema',
    );
  });
});
