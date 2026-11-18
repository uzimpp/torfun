import { expect } from 'vitest';

/**
 * Strings an attacker could plant in agency text, a TOR PDF, an AI summary or a
 * user's report, so a screen that renders them can be shown to keep them inert
 * (ASVS V3.2.2; threat T-08). Each is aimed at a different way markup or script
 * could slip in if a string were ever treated as HTML or as a URL.
 */
export const XSS_PAYLOADS = [
  '<script>window.__xss = 1</script>',
  '<img src=x onerror="window.__xss=1">',
  '<svg onload="window.__xss=1"></svg>',
  '"><iframe srcdoc="<script>1</script>"></iframe>',
  '</p><a href="javascript:alert(1)">pwn</a>',
  '[click](javascript:alert(1))',
  "' onmouseover='alert(1)",
] as const;

/** All the payloads in one string, for a field that takes a single value. */
export const HOSTILE_TEXT = XSS_PAYLOADS.join(' ');

/**
 * Asserts that rendering a string produced text, not markup:
 *  - every payload is on the page verbatim, as text;
 *  - no executable or embedding element was created;
 *  - no element carries an event-handler attribute;
 *  - no link points at a `javascript:` or `data:` URL.
 */
export function expectInert(root: ParentNode = document.body): void {
  const text = (root as Node).textContent ?? '';
  for (const payload of XSS_PAYLOADS) expect(text).toContain(payload);

  expect(root.querySelectorAll('script, iframe, object, embed, base')).toHaveLength(0);

  const withHandler = Array.from(root.querySelectorAll('*')).filter((element) =>
    Array.from(element.attributes).some((attribute) => /^on/i.test(attribute.name)),
  );
  expect(withHandler).toHaveLength(0);

  const hrefs = Array.from(root.querySelectorAll('[href], [src], [action], [formaction]')).flatMap(
    (element) =>
      ['href', 'src', 'action', 'formaction'].map((name) => element.getAttribute(name) ?? ''),
  );
  expect(hrefs.filter((value) => /^\s*(javascript|data|vbscript):/i.test(value))).toEqual([]);
}
