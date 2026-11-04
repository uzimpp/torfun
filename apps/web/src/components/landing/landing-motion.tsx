'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * The landing page's scroll behaviour, and the only place GSAP is used.
 *
 * Three effects, deliberately no more: sections lift into place as they are
 * reached, the workflow rail draws itself against the scrollbar, and the hero
 * panel drifts a little slower than the page. Everything else on this page is
 * CSS, including the hero's entrance, which must not wait for hydration.
 *
 * `gsap.from` is used throughout rather than `gsap.to` from a hidden start
 * state: if this component never runs — a bundle that fails to load, an error
 * during hydration — the page is simply a page, with every word still on it.
 *
 * The whole thing is registered under `prefers-reduced-motion: no-preference`,
 * so a reader who has asked for stillness gets it, and `mm.revert()` puts every
 * property back on unmount.
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia(root);

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      for (const element of gsap.utils.toArray<HTMLElement>('[data-rise]', root)) {
        gsap.from(element, {
          y: 28,
          opacity: 0,
          duration: 0.9,
          ease: 'expo.out',
          delay: Number(element.dataset.rise) * 0.08,
          scrollTrigger: { trigger: element, start: 'top 88%', once: true },
        });
      }

      // The rail is drawn from its top edge, so its progress reads as the
      // reader's own progress through the three stages beside it.
      const rail = root.querySelector<HTMLElement>('[data-rail]');
      if (rail) {
        gsap.fromTo(
          rail,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            transformOrigin: 'top center',
            scrollTrigger: {
              trigger: rail.parentElement ?? rail,
              start: 'top 72%',
              end: 'bottom 65%',
              scrub: 0.6,
            },
          },
        );
      }

      const panel = root.querySelector<HTMLElement>('[data-parallax]');
      if (panel) {
        gsap.to(panel, {
          y: -36,
          ease: 'none',
          scrollTrigger: {
            trigger: panel,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.8,
          },
        });
      }
    });

    // Triggers are measured against the layout as it stands. Thai and Latin
    // fall back to different metrics, so a font swap moves every section under
    // them; re-measuring afterwards keeps a reveal from firing at the wrong
    // scroll position, or never.
    let stale = false;
    void document.fonts?.ready.then(() => {
      if (!stale) ScrollTrigger.refresh();
    });

    return () => {
      stale = true;
      mm.revert();
    };
  }, []);

  return <div ref={scope}>{children}</div>;
}
