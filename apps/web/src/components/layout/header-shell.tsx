'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';

/** Ignore the jitter a trackpad produces while the finger is resting. */
const DEAD_ZONE_PX = 6;
/** Above this the header always shows, so the top of a page is never headless. */
const ALWAYS_OPEN_PX = 88;

/**
 * The sticky header, which gets out of the way when a person is reading down
 * and comes back the moment they scroll up.
 *
 * The travel is a GSAP tween rather than a CSS transition for two reasons.
 * Tailwind v4's `translate-*` utilities write the `translate` property, not
 * `transform`, so a `transition-transform` on them animates nothing and the bar
 * teleports. And a scroll direction can reverse mid-flight: `quickTo` retargets
 * the tween in place, so the header turns around from wherever it is instead of
 * restarting.
 *
 * Everything the scroll handler touches is written straight to the element,
 * never through React state: the handler runs on every frame the page moves,
 * and re-rendering the whole header from it would cost far more than the
 * animation is worth. Styling reacts through `data-scrolled` instead.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const slideTo = gsap.quickTo(header, 'y', {
      duration: still ? 0 : 0.42,
      ease: 'power3.out',
      overwrite: true,
    });

    let hidden = false;
    let lastY = window.scrollY;
    let queued = false;

    function retract(next: boolean) {
      if (!header || next === hidden) return;
      hidden = next;
      header.dataset.hidden = String(next);
      // Measured per move: the bar is taller on a large screen, and the whole
      // point is that it clears the viewport exactly.
      slideTo(next ? -header.offsetHeight - 1 : 0);
    }

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

      if (held || y <= ALWAYS_OPEN_PX) retract(false);
      else if (y > lastY + DEAD_ZONE_PX) retract(true);
      else if (y < lastY - DEAD_ZONE_PX) retract(false);

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
      retract(false);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    header.addEventListener('focusin', reveal);
    return () => {
      window.removeEventListener('scroll', onScroll);
      header.removeEventListener('focusin', reveal);
      gsap.killTweensOf(header);
      gsap.set(header, { clearProps: 'transform' });
    };
  }, []);

  return (
    <header
      ref={ref}
      data-hidden="false"
      data-scrolled="false"
      className={[
        'group/header sticky top-0 z-40 will-change-transform',
        'bg-background/80 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl',
        'border-b border-transparent transition-colors duration-300',
        'data-[scrolled=true]:border-border',
      ].join(' ')}
    >
      {children}
    </header>
  );
}
