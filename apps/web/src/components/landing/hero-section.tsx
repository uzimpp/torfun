import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { TorSearchField } from '@/components/search/tor-search-field';
import { exampleQueries } from '@/components/layout/nav-config';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PipelineScene } from './pipeline-scene';

/**
 * The hero, built around the search field rather than around a button.
 *
 * A visitor who already knows what they are looking for should be able to type
 * it and go, without reading the page first; the sign-up path sits underneath
 * for everyone else. `signedIn` swaps that secondary action, never the search.
 *
 * The text entrance is CSS with a staggered `--enter` delay, so it plays on
 * first paint — nothing anyone has to read waits for hydration. The two things
 * that do need JavaScript, the colour drift and the scene, are decoration: the
 * page is complete without either.
 */
export function HeroSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="landing-grid hero-aurora relative overflow-hidden"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:px-10 lg:pt-24 lg:pb-28">
        <div>
          <p className="enter border-primary/25 bg-card/70 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium tracking-wide [--enter:0]">
            <span aria-hidden="true" className="relative flex size-2">
              <span className="bg-primary/50 absolute inline-flex size-full animate-ping rounded-full" />
              <span className="bg-primary relative inline-flex size-2 rounded-full" />
            </span>
            ข้อมูลเปิด e-GP · จัดซื้อจัดจ้างภาครัฐ
          </p>

          <h1
            id="hero-heading"
            className="enter mt-6 text-4xl font-semibold tracking-tight text-balance [--enter:0] sm:text-5xl lg:text-6xl"
          >
            ค้นหาโอกาสจาก TOR
            <br />
            <span className="text-primary">ให้ตรงกับงานที่คุณถนัด</span>
          </h1>

          <p className="enter text-muted-foreground mt-6 max-w-xl text-lg [--enter:1]">
            ลดเวลาค้นหาประกาศจัดซื้อจัดจ้าง
            ให้ทีมได้ใช้เวลากับการพิจารณางานซอฟต์แวร์ที่เหมาะกับประสบการณ์ของบริษัท
          </p>

          <div className="enter mt-9 max-w-2xl [--enter:1]">
            <TorSearchField size="hero" label="ค้นหาประกาศ TOR" suggestions={exampleQueries} />
          </div>

          <div className="enter mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 [--enter:2]">
            <Link
              href={signedIn ? '/dashboard' : '/register'}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-12 rounded-xl px-5')}
            >
              {signedIn ? 'ไปที่แดชบอร์ด' : 'สร้างบัญชีผู้ใช้'}
              <ArrowUpRight aria-hidden="true" />
            </Link>
            {!signedIn && (
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground py-3 text-sm underline-offset-4 transition-colors hover:underline"
              >
                มีบัญชีแล้ว? เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>

        <div data-parallax className="enter relative isolate [--enter:2] lg:ps-4">
          {/* One sheet showing from under the panel, standing in for the stack
              of announcements it is reading from. Kept as a tinted surface
              rather than a solid slab: at full opacity a filled plate reads as
              a dark stripe down the side of the card rather than as depth. */}
          <div
            aria-hidden="true"
            className="border-border bg-muted/70 absolute inset-x-4 -top-3 bottom-5 -z-10 rotate-[2.5deg] rounded-[1.75rem] border"
          />
          <PipelineScene />
        </div>
      </div>
    </section>
  );
}
