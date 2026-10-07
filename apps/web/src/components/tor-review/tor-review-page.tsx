import { Banknote, CalendarDays, Clock3, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TorReviewData } from './use-tor-review-data';
import { TorReviewBackButton } from './tor-review-back-button';
import { TorDownloadButton } from './tor-download-button';
import { TorFavoriteButton } from './tor-favorite-button';

const bahtFormat = new Intl.NumberFormat('th-TH');

export function TorReviewPage({ tor }: { tor: TorReviewData }) {
  return (
    <main className="page-fill mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <TorReviewBackButton />

      <section className="border-border mt-8 border-b pb-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-center lg:gap-8">
          <div className="min-w-0">
            <p className="text-primary flex items-center gap-2 text-sm font-medium">
              {tor.agency}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">ประกาศจัดซื้อจัดจ้าง</span>
            </p>
            <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
              {tor.title}
            </h1>
            <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {tor.location && (
                <span className="inline-flex items-center gap-2">
                  <MapPin aria-hidden="true" className="size-4" />
                  {tor.location}
                </span>
              )}
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {tor.status}
              </Badge>
            </div>
          </div>

          <div className="bg-muted/60 rounded-xl p-5 sm:p-5">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
              <Banknote aria-hidden="true" className="text-primary size-4" />
              งบประมาณ
            </p>
            <p data-numeric className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {tor.budget === null ? 'ยังไม่มีข้อมูลงบประมาณ' : `${bahtFormat.format(tor.budget)} บาท`}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <TorFavoriteButton projectId={tor.projectId} />
              <TorDownloadButton projectId={tor.projectId} />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="summary-heading" className="mt-12">
        <SectionHeading id="summary-heading" eyebrow="อ่านเร็ว ก่อนเปิดเอกสารต้นฉบับ" title="สรุปโครงการ" />
        <Card className="border-primary/20 bg-primary/5 mt-5">
          <CardHeader>
            <CardTitle className="text-base">สรุปโครงการโดย Vertex AI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed">
              {tor.summary ?? 'ยังไม่มีข้อมูลการวิเคราะห์ TOR'}
            </p>
            {tor.confidence && (
              <p className="text-muted-foreground mt-4 text-xs">
                ระดับความมั่นใจของการวิเคราะห์: {tor.confidence === 'high' ? 'สูง' : 'ต่ำ'}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="match-heading" className="mt-10">
        <SectionHeading id="match-heading" eyebrow="วิเคราะห์เบื้องต้น" title="สรุปความเหมาะสมกับบริษัท" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]">
          <Card className="bg-primary text-primary-foreground overflow-hidden">
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="grid size-40 place-items-center rounded-full border-[14px] border-white/20 border-t-white">
                <div>
                  <p className="font-mono text-5xl leading-none font-medium">
                    {tor.matchScore === null ? '-' : `${tor.matchScore}%`}
                  </p>
                  <p className="mt-2 text-xs font-medium tracking-widest uppercase opacity-80">Match</p>
                </div>
              </div>
              <p className="mt-5 text-sm opacity-85">
                {tor.matchScore === null
                  ? 'ยังไม่มีผลการวิเคราะห์ความเหมาะสม'
                  : 'คะแนนความเหมาะสมโดยประมาณ'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex min-h-72 items-center justify-center p-6 text-center">
              <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                ระบบจะแสดงรายละเอียดการเปรียบเทียบกับข้อมูลบริษัทเมื่อมีผลการวิเคราะห์ความเหมาะสม
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="details-heading" className="mt-12">
        <SectionHeading id="details-heading" eyebrow="ข้อมูลจากประกาศ" title="รายละเอียดโครงการ" />
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <DetailList title="วัตถุประสงค์" items={tor.objectives} />
          <DetailList title="ขอบเขตงาน" items={tor.scope} />
          <DetailList title="คุณสมบัติผู้เสนอราคา" items={tor.bidderQualifications} />
        </div>
      </section>

      {tor.technologies.length > 0 && (
        <section aria-labelledby="technology-heading" className="mt-12">
          <SectionHeading id="technology-heading" eyebrow="ข้อมูลจากเอกสาร TOR" title="เทคโนโลยีที่เกี่ยวข้อง" />
          <div className="mt-5 flex flex-wrap gap-3">
            {tor.technologies.map((technology) => (
              <Badge key={technology} variant="outline" className="px-3 py-1.5 text-sm">
                {technology}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="dates-heading" className="border-border mt-12 border-t pt-8 pb-6">
        <SectionHeading id="dates-heading" eyebrow="อย่าพลาดกำหนดการ" title="กำหนดการสำคัญ" />
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <DateItem label="วันที่ประกาศ" value={tor.announcementDate ?? 'ยังไม่มีข้อมูลวันที่ประกาศ'} />
          <DateItem
            label="ปิดรับข้อเสนอ"
            value={tor.submissionDeadline ?? 'ยังไม่มีข้อมูลวันปิดรับข้อเสนอ'}
            urgent
          />
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-primary text-xs font-medium tracking-wider">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight">
        {title}
      </h2>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="text-muted-foreground space-y-3 text-sm leading-relaxed">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="bg-primary mt-2 size-1.5 shrink-0 rounded-full" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูลส่วนนี้จาก Procurement</p>
        )}
      </CardContent>
    </Card>
  );
}

function DateItem({ label, value, urgent = false }: { label: string; value: string; urgent?: boolean }) {
  return (
    <div className={cn('bg-muted/60 flex items-center gap-3 rounded-xl px-4 py-3', urgent && 'border border-amber-200 dark:border-amber-900')}>
      {urgent ? <Clock3 aria-hidden="true" className="text-amber-600 size-5 shrink-0" /> : <CalendarDays aria-hidden="true" className="text-primary size-5 shrink-0" />}
      <span>
        <span className="text-muted-foreground block text-xs">{label}</span>
        <span className="mt-0.5 block font-medium">{value}</span>
      </span>
    </div>
  );
}
