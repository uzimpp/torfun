import { afterEach, describe, expect, test } from 'bun:test';
import { createAnnouncementClient } from './announcement-client';
import { RateLimitedError, UpstreamError } from './client';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answering(status: number, body: unknown, seen: string[] = []) {
  globalThis.fetch = (async (url: string | URL) => {
    seen.push(String(url));
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return seen;
}

describe('createAnnouncementClient', () => {
  test('asks for the e-bidding timeline of one project, with the parameter the site insists on', async () => {
    const seen = answering(200, { data: { greenBookAnnouncementTypeLinkDto: [] } });

    await createAnnouncementClient().timeline('66059313551');

    const url = new URL(seen[0]!);
    expect(url.pathname).toEndWith('/announcement/greenBook');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: 'LINK',
      methodId: '16',
      tempProjectId: '66059313551',
      pageAnnounceType: 'W0',
    });
  });

  test('returns each announcement’s code and date and nothing else', async () => {
    answering(200, {
      data: {
        greenBookAnnouncementTypeLinkDto: [
          { announceType: 'D0', announceDate: '2026-09-20T02:00:00.000Z', no: 4, extra: 'x' },
          { announceType: 'S0', announceDate: null, no: 10 },
        ],
      },
    });

    expect(await createAnnouncementClient().timeline('1')).toEqual([
      { announceType: 'D0', announceDate: '2026-09-20T02:00:00.000Z' },
      { announceType: 'S0', announceDate: null },
    ]);
  });

  test('a project with no announcements yet is an empty timeline', async () => {
    answering(200, { data: { greenBookAnnouncementTypeLinkDto: [] } });

    expect(await createAnnouncementClient().timeline('1')).toEqual([]);
  });

  test('data: null is "unavailable", never "no announcements"', async () => {
    answering(200, { data: null });

    expect(await createAnnouncementClient().timeline('1')).toBeNull();
  });

  test('a body without a timeline is unavailable too', async () => {
    answering(200, { data: {} });

    expect(await createAnnouncementClient().timeline('1')).toBeNull();
  });

  test('a body that is not JSON is an upstream failure', async () => {
    answering(200, '<html>maintenance</html>');

    await expect(createAnnouncementClient().timeline('1')).rejects.toBeInstanceOf(UpstreamError);
  });

  test.each([429, 403])('a %d is the site saying stop', async (status) => {
    answering(status, '');

    await expect(createAnnouncementClient().timeline('1')).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe('projectDetail', () => {
  /** The fields read from e-GP's answer, among others that are not. */
  const sample = {
    data: {
      projectId: '69109044981',
      budgetYear: '2569',
      typeId: '03',
      goodsId: '4016',
      deptSubName: 'สำนักเทคโนโลยีสารสนเทศ',
      projectName: 'ประกวดราคาจ้างพัฒนาระบบ',
    },
    response: { responseCode: 0 },
  };

  test('asks for one project by id', async () => {
    const seen = answering(200, sample);

    await createAnnouncementClient().projectDetail('69109044981');

    const url = new URL(seen[0]!);
    expect(url.pathname).toEndWith('/announcement/getProjectDetail');
    expect(Object.fromEntries(url.searchParams)).toEqual({ projectId: '69109044981' });
  });

  test('reads the year as a number, and the codes and sub-agency as given', async () => {
    answering(200, sample);

    expect(await createAnnouncementClient().projectDetail('1')).toEqual({
      budgetYear: 2569,
      typeId: '03',
      goodsId: '4016',
      deptSubName: 'สำนักเทคโนโลยีสารสนเทศ',
    });
  });

  test('missing codes and sub-agency are null', async () => {
    answering(200, { data: { budgetYear: 2569, typeId: null, deptSubName: '' } });

    expect(await createAnnouncementClient().projectDetail('1')).toEqual({
      budgetYear: 2569,
      typeId: null,
      goodsId: null,
      deptSubName: null,
    });
  });

  test('data: null is no detail', async () => {
    answering(200, { data: null, response: { responseCode: 0 } });

    expect(await createAnnouncementClient().projectDetail('1')).toBeNull();
  });

  test.each(['', '25x9', '2569.5', null])('a year of %p is no detail', async (budgetYear) => {
    answering(200, { data: { ...sample.data, budgetYear } });

    expect(await createAnnouncementClient().projectDetail('1')).toBeNull();
  });

  test('a body that is not JSON is an upstream failure', async () => {
    answering(200, '<html>maintenance</html>');

    await expect(createAnnouncementClient().projectDetail('1')).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  test.each([429, 403])('a %d is the site saying stop', async (status) => {
    answering(status, '');

    await expect(createAnnouncementClient().projectDetail('1')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});
