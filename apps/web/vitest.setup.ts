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
