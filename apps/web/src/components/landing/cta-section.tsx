import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
/** `signedIn` swaps the call to action; the page itself renders either way. */
export function CtaSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section aria-labelledby="cta-heading" className="bg-muted/50 border-y">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
        <div>
          <h2 id="cta-heading" className="text-3xl font-semibold">
            เริ่มต้นกับ Torfun
          </h2>
          <p className="text-muted-foreground mt-3">
            {signedIn
              ? 'กลับไปยังพื้นที่ทำงานของคุณเพื่อดูประกาศที่คัดกรองไว้'
              : 'สร้างบัญชีสำหรับทีมพัฒนาธุรกิจ หรือเข้าสู่ระบบด้วยบัญชีที่มีอยู่'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          {signedIn ? (
            <Link href="/dashboard" className={cn(buttonVariants(), 'min-h-12 px-5')}>
              ไปที่แดชบอร์ด
            </Link>
          ) : (
            <>
              <Link href="/register" className={cn(buttonVariants(), 'min-h-12 px-5')}>
                สร้างบัญชีผู้ใช้
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'outline' }), 'min-h-12 px-5')}
              >
                เข้าสู่ระบบ
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
