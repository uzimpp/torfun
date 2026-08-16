import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';

export async function crawlPage(url: string) {
  const response = await fetch(url, {
    redirect: 'manual',
  });

  const buffer = await response.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'tis-620');

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}\n${html.slice(0, 500)}`,
    );
  }

  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  const title = $('title').first().text().trim();

  const headings = $('h1, h2, h3')
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);

  const links = $('a')
    .map((_, element) => {
      const href = $(element).attr('href');

      if (!href) {
        return null;
      }

      return {
        text: $(element).text().trim(),
        href: new URL(href, url).href,
      };
    })
    .get()
    .filter(Boolean);

  return {
    url,
    status: response.status,
    redirect: response.headers.get('location'),
    content_type: response.headers.get('content-type'),
    html_length: html.length,
    title,
    headings,
    links,
    text,
  };
}
