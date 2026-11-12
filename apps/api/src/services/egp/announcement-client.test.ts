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

const DRAFT_DETAIL = {
  data: {
    projectId: '69109238096',
    goodsId: '4016',
    typeId: '03',
    methodId: '16',
    projectVersion: '4',
    typeProject: '9',
    stepId: 'U03',
    projectMoney: 23248000,
    priceBuild: 23198991,
    questionFdate: null,
    deliverDay: null,
  },
  response: { responseCode: 0, responseDesc: '' },
};

const INVITATION_DETAIL = {
  data: {
    projectId: '69109123098',
    goodsId: '4016',
    typeId: '03',
    stepId: 'M03',
    flagQuestion: 'Y',
    questionFdate: '2026-10-29T17:00:00.000Z',
    deliverDay: 304,
  },
  response: { responseCode: 0, responseDesc: '' },
};

describe('procurementDetail', () => {
  test('asks for one project by id', async () => {
    const seen = answering(200, DRAFT_DETAIL);

    await createAnnouncementClient().procurementDetail('69109238096');

    const url = new URL(seen[0]!);
    expect(url.pathname).toEndWith('/announcement/getProcurementDetail');
    expect(Object.fromEntries(url.searchParams)).toEqual({ projectId: '69109238096' });
  });

  test('reads a draft’s category, money, and what its draft list is asked with', async () => {
    answering(200, DRAFT_DETAIL);

    expect(await createAnnouncementClient().procurementDetail('69109238096')).toEqual({
      goodsId: '4016',
      typeId: '03',
      deptSubName: null,
      projectMoney: 23248000,
      priceBuild: 23198991,
      draftListParams: {
        methodId: '16',
        projectVersion: '4',
        typeProject: '9',
        stepId: 'U03',
        typeId: '03',
      },
    });
  });

  test('reads the category of a project past its draft', async () => {
    answering(200, INVITATION_DETAIL);

    expect(await createAnnouncementClient().procurementDetail('69109123098')).toMatchObject({
      goodsId: '4016',
      typeId: '03',
    });
  });

  test('a missing goodsId is a detail with no category', async () => {
    const { goodsId: _, ...data } = DRAFT_DETAIL.data;
    answering(200, { ...DRAFT_DETAIL, data });

    const detail = await createAnnouncementClient().procurementDetail('1');

    expect(detail).not.toBeNull();
    expect(detail!.goodsId).toBeNull();
  });

  test('money written as text is read as a number; anything else is no amount', async () => {
    answering(200, {
      data: { ...DRAFT_DETAIL.data, projectMoney: '23248000.00', priceBuild: 'n/a' },
    });

    expect(await createAnnouncementClient().procurementDetail('1')).toMatchObject({
      projectMoney: 23248000,
      priceBuild: null,
    });
  });

  test('without every parameter, the draft list cannot be asked for', async () => {
    const { projectVersion: _, ...data } = DRAFT_DETAIL.data;
    answering(200, { data });

    expect(await createAnnouncementClient().procurementDetail('1')).toMatchObject({
      draftListParams: null,
    });
  });

  test('data: null is no detail', async () => {
    answering(200, { data: null, response: { responseCode: 0 } });

    expect(await createAnnouncementClient().procurementDetail('1')).toBeNull();
  });

  test('a body that is not JSON is an upstream failure', async () => {
    answering(200, '<html>maintenance</html>');

    await expect(createAnnouncementClient().procurementDetail('1')).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  test.each([429, 403])('a %d is the site saying stop', async (status) => {
    answering(status, '');

    await expect(createAnnouncementClient().procurementDetail('1')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});

describe('commentsCloseAt', () => {
  const PARAMS = {
    methodId: '16',
    projectVersion: '4',
    typeProject: '9',
    stepId: 'U03',
    typeId: '03',
  };

  const FIRST_VERSION = {
    buildName: '69109238096_21102569.zip',
    commentFDate: '2026-10-26T17:00:00.000Z',
    webDate: '2026-10-20T17:00:00.000Z',
    stepId: 'D03',
    projectId: '69109238096',
  };
  const REVISED = {
    ...FIRST_VERSION,
    buildName: '69109238096_28102569.zip',
    commentFDate: '2026-11-02T17:00:00.000Z',
    webDate: '2026-10-27T17:00:00.000Z',
  };

  test('asks for one project’s draft list with the parameters its detail gave', async () => {
    const seen = answering(200, { data: [FIRST_VERSION] });

    await createAnnouncementClient().commentsCloseAt('69109238096', PARAMS);

    const url = new URL(seen[0]!);
    expect(url.pathname).toEndWith('/announcement/getTorZipList');
    expect(Object.fromEntries(url.searchParams)).toEqual({ projectId: '69109238096', ...PARAMS });
  });

  test('is the comment deadline as e-GP sends it', async () => {
    answering(200, { data: [FIRST_VERSION], response: { responseCode: 0, responseDesc: '' } });

    expect(await createAnnouncementClient().commentsCloseAt('69109238096', PARAMS)).toBe(
      '2026-10-26T17:00:00.000Z',
    );
  });

  test.each([
    ['first', [REVISED, FIRST_VERSION]],
    ['last', [FIRST_VERSION, REVISED]],
  ])('the latest draft version wins, listed %s', async (_, rows) => {
    answering(200, { data: rows });

    expect(await createAnnouncementClient().commentsCloseAt('69109238096', PARAMS)).toBe(
      '2026-11-02T17:00:00.000Z',
    );
  });

  test.each([
    ['data: null', { data: null }],
    ['no versions', { data: [] }],
    ['a version with no deadline', { data: [{ ...FIRST_VERSION, commentFDate: null }] }],
  ])('%s is no deadline', async (_, body) => {
    answering(200, body);

    expect(await createAnnouncementClient().commentsCloseAt('1', PARAMS)).toBeNull();
  });

  test('a body that is not JSON is an upstream failure', async () => {
    answering(200, '<html>maintenance</html>');

    await expect(createAnnouncementClient().commentsCloseAt('1', PARAMS)).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  test.each([429, 403])('a %d is the site saying stop', async (status) => {
    answering(status, '');

    await expect(createAnnouncementClient().commentsCloseAt('1', PARAMS)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});
