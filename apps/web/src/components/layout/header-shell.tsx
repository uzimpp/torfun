'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Ignore the jitter a trackpad produces while the finger is resting. */
const DEAD_ZONE_PX = 6;
/** Above this the header always shows, so the top of a page is never headless. */
const ALWAYS_OPEN_PX = 88;

/**
 * The sticky header, which gets out of the way when a person is reading down
 * and comes back the moment they scroll up.
 *
 * Everything the scroll handler touches is a data attribute written straight to
 * the element, never React state: the handler runs on every frame the page
 * moves, and re-rendering the whole header from it would cost far more than the
 * animation is worth. Styling reacts through `data-hidden` / `data-scrolled`
 * variants instead.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;

    let lastY = window.scrollY;
    let queued = false;

    function update() {
      queued = false;
      if (!header) return;
      const y = Math.max(window.scrollY, 0);
      header.dataset.scrolled = y > 4 ? 'true' : 'false';

      // Never retract while the header holds focus or a control inside it is
      // open: hiding the element a keyboard user is standing on loses them.
      const held =
        header.contains(document.activeElement) ||
        header.querySelector('[aria-expanded="true"]') !== null;

      if (held || y <= ALWAYS_OPEN_PX) header.dataset.hidden = 'false';
      else if (y > lastY + DEAD_ZONE_PX) header.dataset.hidden = 'true';
      else if (y < lastY - DEAD_ZONE_PX) header.dataset.hidden = 'false';

      lastY = y;
    }

    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    // Tabbing into a retracted header produces no scroll event, so focus has to
    // pull it back down on its own.
    function reveal() {
      if (header) header.dataset.hidden = 'false';
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    header.addEventListener('focusin', reveal);
    return () => {
      window.removeEventListener('scroll', onScroll);
      header.removeEventListener('focusin', reveal);
    };
  }, []);

  return (
    <header
      ref={ref}
      data-hidden="false"
      data-scrolled="false"
      className={[
        'group/header sticky top-0 z-40',
        // One transition declaration: a second `transition-*` utility would
        // replace this property list rather than add to it.
        'transition-[transform,border-color,background-color] duration-400',
        'ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        'data-[hidden=true]:-translate-y-full',
        'bg-background/80 supports-[backdrop-filter]:bg-background/65 backdrop-blur-xl',
        'data-[scrolled=true]:border-border border-b border-transparent',
      ].join(' ')}
    >
      {children}
    </header>
  );
}
