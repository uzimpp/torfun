import { afterEach, describe, expect, test } from 'bun:test';
import { createAnnouncementFeed, parseFeed } from './announcement-feed';
import { RateLimitedError, UpstreamError } from './client';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function item(description: string, title = 'ประกวดราคาจ้างพัฒนาระบบ', pubDate = '2026-10-05') {
  return `<item>
    <title>${title}</title>
    <link>https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file?templateId=x</link>
    <description>${description}</description>
    <pubDate>${pubDate}</pubDate>
    <guid></guid>
  </item>`;
}

function feed(items: string[], countByDay?: number) {
  return `<?xml version="1.0" encoding="Windows-874" ?>
<rss version="2.0"><channel><title>e-GP</title>
${countByDay === undefined ? '' : `<countbyday>${countByDay}</countbyday>`}
${items.join('\n')}
</channel></rss>`;
}

describe('parseFeed', () => {
  test('takes the project id, method and announcement from the description', () => {
    const day = parseFeed(
      feed([item('69109044981, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน')], 1),
    );

    expect(day).toEqual({
      announced: 1,
      withoutId: 0,
      items: [
        {
          projectId: '69109044981',
          title: 'ประกวดราคาจ้างพัฒนาระบบ',
          methodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
          announcementName: 'ประกาศเชิญชวน',
          announcedOn: '2026-10-05',
        },
      ],
    });
  });

  test('keeps the true count where the feed cut the list short', () => {
    const day = parseFeed(
      feed([item('68019123601, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน')], 36),
    );

    expect(day.announced).toBe(36);
    expect(day.items).toHaveLength(1);
  });

  test('counts an item with no project id rather than inventing one', () => {
    const day = parseFeed(feed([item('แผนการจัดซื้อจัดจ้าง')], 1));

    expect(day.items).toEqual([]);
    expect(day.withoutId).toBe(1);
  });

  test('unescapes entities in titles', () => {
    const day = parseFeed(
      feed([item('69099754659, e-bidding, ประกาศเชิญชวน', 'ซ่อม &amp; บำรุง &#3585;')]),
    );

    expect(day.items[0]!.title).toBe('ซ่อม & บำรุง ก');
  });

  test('an empty day is an answer: nothing announced', () => {
    expect(parseFeed(feed([], 0))).toEqual({ announced: 0, items: [], withoutId: 0 });
  });

  test('a page that is not RSS is a failure, never an empty day', () => {
    expect(() => parseFeed('<html><body>Just a moment...</body></html>')).toThrow(UpstreamError);
  });
});

describe('createAnnouncementFeed', () => {
  function answering(status: number, body: Uint8Array | string, seen: string[] = []) {
    globalThis.fetch = (async (url: string | URL) => {
      seen.push(String(url));
      return new Response(body, { status });
    }) as unknown as typeof fetch;
    return seen;
  }

  test('asks for one agency, type and day, e-bidding only', async () => {
    const seen = answering(200, feed([], 0));

    await createAnnouncementFeed().day('1108', 'D0', '2026-10-05');

    const url = new URL(seen[0]!);
    expect(url.pathname).toEndWith('/egpannouncerss.xml');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      deptId: '1108',
      anounceType: 'D0',
      announceDate: '20261005',
      methodId: '16',
    });
  });

  test('decodes the Windows-874 the feed is served in', async () => {
    const prefix = feed([item('69109044981, e-bidding, X', 'TITLE')]).split('TITLE');
    const thai = new Uint8Array([0xbb, 0xc3, 0xd0, 0xa1, 0xd2, 0xc8]); // ประกาศ
    const ascii = (text: string) => new TextEncoder().encode(text);
    answering(200, new Uint8Array([...ascii(prefix[0]!), ...thai, ...ascii(prefix[1]!)]));

    const day = await createAnnouncementFeed().day('1108', 'D0', '2026-10-05');

    expect(day.items[0]!.title).toBe('ประกาศ');
  });

  test('a refusal is raised as a rate limit, for the caller to stop on', async () => {
    answering(429, 'Rate limit exceeded. Try again later.');

    await expect(createAnnouncementFeed().day('1108', 'D0', '2026-10-05')).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});
