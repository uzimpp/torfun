import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither of these, and the floating-element primitives behind
 * the popover measure with both. Stubbing them keeps a test about what an
 * officer sees from failing over layout the DOM never performs anyway.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * jsdom has no media queries, and the landing page's motion layer asks for one
 * before it animates anything. Reporting no match is the honest answer for a
 * DOM that never paints: the assertions are about the markup a reader gets, and
 * that markup is complete before GSAP touches it.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
