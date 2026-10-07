import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const scope = [
  ['ประเภทงาน', 'ซอฟต์แวร์'],
  ['วิธีจัดซื้อ', 'e-bidding'],
  ['แหล่งข้อมูล', 'ข้อมูลเปิด e-GP'],
];

/**
 * What the product does not do, said before anyone asks.
 *
 * The scope is narrow on purpose and the AI summary is a reading aid rather
 * than a source — an officer who learns that here, rather than after acting on
 * a summary, is the whole reason this section is on the page instead of in a
 * help article. `signedIn` swaps the call to action beside it.
 */
export function LimitsSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section aria-labelledby="limits-heading" id="limits" className="scroll-mt-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:gap-20 lg:px-10 lg:py-28">
        <div>
          <p data-rise="0" className="text-primary text-xs font-medium tracking-wider uppercase">
            ขอบเขตและข้อจำกัด
          </p>
          <h2
            id="limits-heading"
            data-rise="1"
            className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            รู้ว่าระบบครอบคลุมแค่ไหน ก่อนใช้ตัดสินใจ
          </h2>

          <dl data-rise="2" className="divide-border mt-10 divide-y border-y">
            {scope.map(([term, value]) => (
              <div key={term} className="flex items-baseline justify-between gap-6 py-4">
                <dt className="text-muted-foreground text-sm">{term}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <p data-rise="3" className="text-muted-foreground mt-8 max-w-xl text-sm">
            การจัดกลุ่มประเภทงานอาศัยรูปแบบของชื่อโครงการ ใช้เพื่อจัดลำดับความสำคัญได้
            แต่ไม่ควรใช้แทนการอ่านประกาศ และเอกสารต้นฉบับยังเข้าถึงได้เสมอเพื่อให้ตรวจสอบได้เอง
          </p>

          {/* Stated on the page itself, not only in the footer — someone reading
              about what the product does should meet this while they are still
              forming an expectation of it. Worded differently from the footer's
              version on purpose: the two are visible in one scroll, and the
              same sentence twice reads as a template rather than as a point. */}
          <p
            data-rise="3"
            className="border-primary/40 text-muted-foreground mt-6 max-w-xl border-s-2 ps-4 text-sm"
          >
            AI ช่วยสรุปข้อกำหนดเพื่อให้อ่านได้เร็วขึ้น แต่ไม่ใช่คำยืนยัน ทีมของคุณต้องอ่านเอกสาร TOR
            ต้นฉบับก่อนตัดสินใจยื่นข้อเสนอเสมอ
          </p>
        </div>

        <div
          data-rise="1"
          className="bg-card shadow-soft flex h-fit flex-col rounded-3xl border p-8 lg:sticky lg:top-28"
        >
          <h3 className="text-2xl font-semibold tracking-tight">เริ่มต้นกับ Torfun</h3>
          <p className="text-muted-foreground mt-3">
            {signedIn
              ? 'กลับไปยังพื้นที่ทำงานของคุณเพื่อดูประกาศที่คัดกรองไว้'
              : 'สร้างบัญชีสำหรับทีมพัฒนาธุรกิจ แล้วบันทึกประสบการณ์ของบริษัทเพื่อให้ระบบเทียบกับข้อกำหนดได้'}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            {signedIn ? (
              <Link href="/dashboard" className={cn(buttonVariants(), 'min-h-12 rounded-xl px-5')}>
                ไปที่แดชบอร์ด <ArrowUpRight aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link href="/register" className={cn(buttonVariants(), 'min-h-12 rounded-xl px-5')}>
                  สร้างบัญชีผู้ใช้ <ArrowUpRight aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: 'outline' }), 'min-h-12 rounded-xl px-5')}
                >
                  เข้าสู่ระบบ
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
