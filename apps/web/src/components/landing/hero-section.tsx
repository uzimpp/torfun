import Link from 'next/link';
import { ArrowUpRight, FileText, ListFilter, BookOpenCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
/** `signedIn` swaps the call to action; the page itself renders either way. */
export function HeroSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="landing-grid relative overflow-hidden border-b"
    >
      <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pt-14 pb-16 sm:px-8 sm:pt-20 sm:pb-24 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-16 lg:px-10">
        <div>
          <p className="text-primary mb-6 text-sm font-medium">
            โอกาสที่ใช่ เริ่มจากข้อมูลที่ชัดเจน
          </p>
          <h1
            id="hero-heading"
            className="text-4xl leading-[1.4] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            ค้นหาโอกาสจาก TOR
            <br />
            <span className="text-primary">
              ให้ตรงกับงาน
              <br className="hidden lg:block" />
              ที่คุณถนัด
            </span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-lg text-base leading-loose sm:text-lg">
            ลดเวลาค้นหาประกาศ
            ให้ทีมได้ใช้เวลากับการพิจารณางานซอฟต์แวร์ที่เหมาะกับประสบการณ์ของบริษัท
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href={signedIn ? '/dashboard' : '/register'}
              className={cn(buttonVariants(), 'min-h-12 rounded-xl px-6')}
            >
              {signedIn ? 'ไปที่แดชบอร์ด' : 'เริ่มต้นใช้งาน'} <ArrowUpRight aria-hidden="true" />
            </Link>
            {signedIn ? null : (
              <Link
                href="/login"
                className="text-primary py-3 text-sm font-medium underline-offset-4 hover:underline"
              >
                มีบัญชีแล้ว? เข้าสู่ระบบ
              </Link>
            )}
          </div>
          <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
            งานซอฟต์แวร์ · e-bidding · กรุงเทพมหานคร
          </p>
        </div>
        <div className="relative isolate py-5 sm:px-4">
          <div className="bg-secondary absolute inset-0 -z-10 rotate-3 rounded-[2.5rem]" />
          <div className="bg-card border-border rounded-[2rem] border px-6 py-8 shadow-[0_20px_70px_-35px_rgba(63,84,65,0.35)] sm:px-8">
            <div className="text-primary flex items-center justify-between border-b pb-5">
              <span className="text-sm font-semibold">จากประกาศ สู่ความเข้าใจ</span>
              <FileText aria-hidden="true" className="size-5" />
            </div>
            <ol className="space-y-7 py-7">
              {[
                { Icon: FileText, title: 'ประกาศจากหน่วยงาน', text: 'เริ่มจากข้อมูลเปิด e-GP' },
                {
                  Icon: ListFilter,
                  title: 'คัดกรองงานที่เกี่ยวข้อง',
                  text: 'มุ่งเน้นโครงการด้านซอฟต์แวร์',
                },
                {
                  Icon: BookOpenCheck,
                  title: 'อ่าน TOR อย่างมีบริบท',
                  text: 'ตรวจสอบต้นฉบับก่อนตัดสินใจ',
                },
              ].map(({ Icon, title, text }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="bg-background text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{title}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground border-t pt-5 text-xs leading-relaxed">
              แนวทางการทำงานของ Torfun
              <br />
              AI ช่วยอ่าน โดยมีทีมของคุณเป็นผู้ตัดสินใจ
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
