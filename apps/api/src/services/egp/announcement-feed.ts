import { egpGet, UpstreamError } from './client';
import {
  ANNOUNCEMENT_FEED_URL,
  BROWSER_HEADERS,
  FEED_E_BIDDING_METHOD_ID,
  type FeedAnnouncementType,
} from './constants';

/**
 * e-GP's announcement feed: what one agency announced on one day, of one type,
 * by e-bidding. It is how Discovery learns a project exists (ADR-0018).
 *
 * Reaching the site, this is called only from inside a SiteGate hold, like every
 * other request to it.
 */

/** One announcement as the feed lists it. */
export interface FeedItem {
  /** e-GP's 11-digit project id, the first field of the item's description. */
  projectId: string;
  title: string;
  /** The tender method as e-GP names it, e.g. "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)". */
  methodName: string;
  /** What was announced, e.g. "ประกาศเชิญชวน". */
  announcementName: string;
  /** `YYYY-MM-DD`, the day the feed files it under; null where it gives none. */
  announcedOn: string | null;
}

export interface FeedDay {
  /**
   * How many announcements the agency made that day, from `<countbyday>`. Greater
   * than `items.length` when the feed's cap cut the list short.
   */
  announced: number;
  items: FeedItem[];
  /** Items whose description carried no project id; they cannot be followed up, so they are counted, not kept. */
  withoutId: number;
}

export interface AnnouncementFeed {
  day(
    deptId: string,
    type: FeedAnnouncementType,
    /** `YYYY-MM-DD`, read as a Bangkok calendar day. */
    date: string,
    signal?: AbortSignal,
  ): Promise<FeedDay>;
}

/**
 * The feed is served as Windows-874, whatever its HTTP header claims. The runtime
 * decodes it (a WHATWG encoding); TypeScript's lib lists only a few labels.
 */
const decoder = new TextDecoder('windows-874' as 'utf-8');

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function field(item: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(item);
  return match ? unescapeXml(match[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : '';
}

/**
 * Read one feed document. Exported for tests: the network half is `egpGet`.
 *
 * Anything that is not an RSS document (a block page, an error page) throws:
 * a page the site did not mean as an answer must never read as "nothing
 * announced".
 */
export function parseFeed(xml: string): FeedDay {
  if (!/<rss[\s>]/.test(xml) || !/<channel>/.test(xml)) {
    throw new UpstreamError('The announcement feed answered with something other than RSS.');
  }

  const items: FeedItem[] = [];
  let withoutId = 0;
  for (const [, raw] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const description = field(raw!, 'description');
    const projectId = /^\s*(\d{11})\b/.exec(description)?.[1];
    if (!projectId) {
      withoutId += 1;
      continue;
    }
    // "<id>, <method>, <announcement>"; only the announcement's own name may hold a comma.
    const [, methodName = '', ...announcement] = description.split(',');
    const pubDate = field(raw!, 'pubDate');
    items.push({
      projectId,
      title: field(raw!, 'title'),
      methodName: methodName.trim(),
      announcementName: announcement.join(',').trim(),
      announcedOn: /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? pubDate : null,
    });
  }

  const count = /<countbyday>\s*(\d+)\s*<\/countbyday>/.exec(xml);
  const listed = items.length + withoutId;
  return { announced: count ? Math.max(Number(count[1]), listed) : listed, items, withoutId };
}

export function createAnnouncementFeed(): AnnouncementFeed {
  return {
    async day(deptId, type, date, signal) {
      const response = await egpGet(
        ANNOUNCEMENT_FEED_URL,
        {
          deptId,
          anounceType: type, // sic: the site's own spelling
          announceDate: date.replaceAll('-', ''),
          methodId: FEED_E_BIDDING_METHOD_ID,
        },
        BROWSER_HEADERS,
        signal,
      );
      return parseFeed(decoder.decode(await response.arrayBuffer()));
    },
  };
}
