import { describe, expect, test } from 'bun:test';
import { TorSchema } from './tor';

describe('TorSchema', () => {
  test('accepts a well-formed Bangkok TOR', () => {
    const result = TorSchema.safeParse({
      id: 'tor_1',
      title: 'ระบบจัดการเอกสารอิเล็กทรอนิกส์',
      agency: 'สำนักงานเขตบางรัก',
      province: 'bangkok',
      publishedAt: '2026-08-01T00:00:00.000Z',
      deadlineAt: '2026-09-01T00:00:00.000Z',
      source: {
        websiteName: 'epg2.bangkok.go.th',
        sourceUrl: 'https://epg2.bangkok.go.th/announcement/1',
      },
      contentHash: 'abc123',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  test('rejects a province other than bangkok', () => {
    const result = TorSchema.safeParse({
      id: 'tor_2',
      title: 'Some project',
      agency: 'Some agency',
      province: 'chiang_mai',
      publishedAt: '2026-08-01T00:00:00.000Z',
      deadlineAt: '2026-09-01T00:00:00.000Z',
      source: { websiteName: 'x', sourceUrl: 'https://example.com' },
      contentHash: 'abc123',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });
});
