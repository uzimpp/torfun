import Link from 'next/link';
import { ArrowUpRight, BookOpenCheck, FileText, ListFilter } from 'lucide-react';

import { TorSearchField } from '@/components/search/tor-search-field';
import { exampleQueries } from '@/components/layout/nav-config';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const stages = [
  { Icon: FileText, title: 'ประกาศจากหน่วยงาน', text: 'เริ่มจากข้อมูลเปิด e-GP' },
  { Icon: ListFilter, title: 'คัดกรองงานที่เกี่ยวข้อง', text: 'มุ่งเน้นโครงการด้านซอฟต์แวร์' },
  { Icon: BookOpenCheck, title: 'อ่าน TOR อย่างมีบริบท', text: 'ตรวจสอบต้นฉบับก่อนตัดสินใจ' },
];

/**
 * The hero, built around the search field rather than around a button.
 *
 * A visitor who already knows what they are looking for should be able to type
 * it and go, without reading the page first; the sign-up path sits underneath
 * for everyone else. `signedIn` swaps that secondary action, never the search.
 *
 * The entrance is CSS with a staggered `--enter` delay, so it plays on first
 * paint — nothing above the fold waits for hydration to become readable.
 */
export function HeroSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section aria-labelledby="hero-heading" className="landing-grid relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16 lg:px-10 lg:pt-24 lg:pb-28">
        <div>
          <p className="enter text-muted-foreground inline-flex items-center gap-2 text-xs tracking-wider uppercase [--enter:0]">
            <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
            ข้อมูลเปิด e-GP · กรุงเทพมหานคร
          </p>

          <h1
            id="hero-heading"
            className="enter mt-5 text-4xl font-semibold tracking-tight text-balance [--enter:0] sm:text-5xl lg:text-6xl"
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
          <div className="bg-card shadow-lifted rounded-[1.75rem] border p-6 sm:p-8">
            <div className="flex items-center justify-between border-b pb-5">
              <span className="text-sm font-semibold">จากประกาศ สู่ความเข้าใจ</span>
              <FileText aria-hidden="true" className="text-primary size-5" />
            </div>

            <ol className="space-y-6 py-7">
              {stages.map(({ Icon, title, text }, index) => (
                <li key={title} className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2 font-medium">
                      <span data-numeric className="text-muted-foreground font-mono text-xs">
                        0{index + 1}
                      </span>
                      {title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="text-muted-foreground border-t pt-5 text-xs">
              AI ช่วยอ่าน โดยมีทีมของคุณเป็นผู้ตัดสินใจ
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
