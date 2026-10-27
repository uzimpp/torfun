'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { ArrowDown, ArrowUp } from 'lucide-react';

/** How far from the page's top/real end counts as "already there". */
const EDGE_THRESHOLD_PX = 400;
/** How far the last row's bottom can be below the viewport before it's worth a button. */
const LAST_ITEM_THRESHOLD_PX = 100;
/** How far a button travels sliding fully in/out, in pixels. */
const SLIDE_PX = 24;
/** Button diameter (`size-11`) plus the old flex `gap-3` — how far the up
 * button sits above its resting spot while the down button is also showing. */
const STACK_OFFSET_PX = 44 + 12;

function queryLastItem(selector: string | undefined): Element | null {
  if (!selector) return null;
  const matches = document.querySelectorAll(selector);
  return matches.item(matches.length - 1);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Floating jump-to-top/bottom shortcuts for a results page long enough to
 * need them. Each button only shows while there's somewhere left to jump to
 * in that direction, so a short results list gets no floating clutter at all.
 * They float independently — no shared backing pill — so each is free to
 * slide in and out on its own.
 *
 * Both buttons anchor to the *same* fixed spot rather than stacking in a flex
 * column: with a shared column, removing the down button on reaching the
 * bottom made the up button jump into its place via ordinary layout reflow,
 * with nothing to animate that reflow. Anchoring both to one spot and giving
 * the up button a GSAP-driven `y` offset when its sibling is present makes
 * that a tween instead of a snap — see `stackOffset` below.
 *
 * "Bottom" means the last result row, not the actual end of the page —
 * jumping past it would land on the pagination controls or footer, past the
 * thing the reader was trying to reach. `lastItemSelector` names that row;
 * omit it to fall back to the page's real end.
 */
export function ScrollButtons({ lastItemSelector }: { lastItemSelector?: string }) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    function update() {
      setCanScrollUp(window.scrollY > EDGE_THRESHOLD_PX);

      const target = queryLastItem(lastItemSelector);
      setCanScrollDown(
        target
          ? target.getBoundingClientRect().bottom - window.innerHeight > LAST_ITEM_THRESHOLD_PX
          : window.scrollY + window.innerHeight <
              document.documentElement.scrollHeight - EDGE_THRESHOLD_PX,
      );
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [lastItemSelector]);

  if (!canScrollUp && !canScrollDown) return null;

  function scrollToBottom() {
    const target = queryLastItem(lastItemSelector);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'end' });
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }

  return (
    <>
      <ScrollButton
        visible={canScrollUp}
        direction="up"
        stackOffset={canScrollDown ? STACK_OFFSET_PX : 0}
        label="เลื่อนขึ้นบนสุด"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        icon={<ArrowUp aria-hidden="true" className="size-5" />}
      />
      <ScrollButton
        visible={canScrollDown}
        direction="down"
        stackOffset={0}
        label="เลื่อนไปประกาศสุดท้าย"
        onClick={scrollToBottom}
        icon={<ArrowDown aria-hidden="true" className="size-5" />}
      />
    </>
  );
}

/**
 * Slides in from, and back out toward, the edge it points at — the up button
 * from above, the down button from below — so appearing and disappearing read
 * as movement along the page rather than a control blinking in and out.
 *
 * Stays mounted through its own exit tween: `visible` turning false starts the
 * slide-away, and only the tween's `onComplete` actually unmounts it, which is
 * what makes reaching the last item a slide-out rather than a cut. Both tweens
 * use a purely decelerating/accelerating ease — no overshoot — so the motion
 * reads as smooth rather than bouncy.
 *
 * `stackOffset` is the button's *other* motion: how far above its base spot it
 * rests to make room for a sibling below it, independent of its own
 * visibility. A change to it (the sibling appearing or disappearing) tweens
 * the resting position itself, which is what makes the up button glide down
 * to fill the gap rather than snapping into it.
 */
function ScrollButton({
  visible,
  direction,
  stackOffset,
  label,
  icon,
  onClick,
}: {
  visible: boolean;
  direction: 'up' | 'down';
  stackOffset: number;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  const [mounted, setMounted] = useState(visible);
  const ref = useRef<HTMLButtonElement>(null);
  const hasEntered = useRef(false);
  const restY = -stackOffset;
  const hiddenY = restY + (direction === 'up' ? -SLIDE_PX : SLIDE_PX);

  // Mounting (and, with no animation to wait for, unmounting) is state derived
  // from `visible`, adjusted here during render rather than in an effect —
  // each branch is guarded by `mounted` itself, so it only ever fires once per
  // actual transition. The effect below is left to do only what an effect
  // is for: driving the GSAP tween, an external system.
  if (visible && !mounted) setMounted(true);
  if (!visible && mounted && prefersReducedMotion()) setMounted(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;

    if (prefersReducedMotion()) {
      // Still needs to land at the right resting spot — just without a tween.
      // (Hiding needs no such step: the render-phase check above already
      // unmounts this element in the same pass, before this effect runs.)
      gsap.set(el, { y: restY, opacity: 1, scale: 1 });
      return;
    }

    if (visible) {
      if (hasEntered.current) {
        // Already on screen — this run is a reposition (the sibling showed up
        // or left), not an entrance, so glide from wherever it already is.
        gsap.to(el, { y: restY, duration: 0.4, ease: 'power3.out' });
      } else {
        hasEntered.current = true;
        gsap.fromTo(
          el,
          { y: hiddenY, opacity: 0, scale: 0.85 },
          { y: restY, opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' },
        );
      }
    } else {
      hasEntered.current = false;
      gsap.to(el, {
        y: hiddenY,
        opacity: 0,
        scale: 0.85,
        duration: 0.35,
        ease: 'power3.inOut',
        onComplete: () => setMounted(false),
      });
    }
  }, [visible, mounted, restY, hiddenY]);

  if (!mounted) return null;

  return (
    // GSAP owns this element's `transform` (position + entrance/exit scale).
    // The hover/press scale lives on the inner span instead of here, so the
    // two never fight over the same CSS property — a GSAP tween writes a
    // literal inline `transform`, which would otherwise silently block the
    // Tailwind `hover:scale-110` rule from ever taking effect.
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed right-4 bottom-4 z-40 flex size-11 items-center justify-center sm:right-6 sm:bottom-6"
    >
      <span className="bg-card border-border text-foreground hover:bg-muted flex size-full items-center justify-center rounded-full border shadow-lg transition-[transform,background-color] duration-300 ease-out hover:scale-110 active:scale-90">
        {icon}
      </span>
    </button>
  );
}
