import { Banknote, CalendarDays, Clock3, Gavel, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deadlineLabel, deadlineText } from '@/lib/deadline-display';
import { formatThaiDate } from '@/lib/format-date';
import { ProcurementStatusBadge } from '@/components/search/procurement-status-badge';
import { cn } from '@/lib/utils';
import type { TorReviewData } from './use-tor-review-data';
import { TorReviewBackButton } from './tor-review-back-button';
import { TorDownloadButton } from './tor-download-button';
import { TorFavoriteButton } from './tor-favorite-button';
import { TorReportButton } from './tor-report-button';

const bahtFormat = new Intl.NumberFormat('th-TH');

export function TorReviewPage({ tor }: { tor: TorReviewData }) {
  return (
    <main className="page-fill mx-auto w-full max-w-7xl px-5 pt-6 pb-8 sm:px-8 lg:px-10 lg:pt-10 lg:pb-12">
      <TorReviewBackButton />
      {tor.publicationRemoval && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          TOR นี้ถูกนำออกจากการเผยแพร่แล้ว หน้านี้และเอกสารต้นฉบับเข้าถึงได้เฉพาะผู้ดูแลระบบ
        </p>
      )}

      <section className="mt-4 pb-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-center lg:gap-8">
          <div className="min-w-0">
            <p className="text-primary flex items-center gap-2 text-sm font-medium">
              {tor.agency}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">ประกาศจัดซื้อจัดจ้าง</span>
            </p>
            <h1 className="mt-4 text-2xl font-medium tracking-tight text-balance">{tor.title}</h1>
            <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-2">
                <CalendarDays aria-hidden="true" className="size-4" />
                ปีงบประมาณ {tor.budgetYear ?? '—'}
              </span>
              {tor.procurementMethod && (
                <span className="inline-flex items-center gap-2">
                  <Gavel aria-hidden="true" className="size-4" />
                  วิธีการจัดซื้อจัดจ้าง: {tor.procurementMethod}
                </span>
              )}
              <ProcurementStatusBadge status={tor.status} />
            </div>
          </div>

          <div className="bg-muted/60 rounded-xl p-5 sm:p-5">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
              <Banknote aria-hidden="true" className="text-primary size-4" />
              งบประมาณ
            </p>
            <p data-numeric className="mt-2 text-2xl font-medium tracking-tight">
              {tor.budget === null
                ? 'ยังไม่มีข้อมูลงบประมาณ'
                : `${bahtFormat.format(tor.budget)} บาท`}
            </p>
            <div
              role="group"
              aria-label={deadlineLabel(tor.deadline)}
              className="border-border mt-5 border-t pt-4"
            >
              <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <Clock3 aria-hidden="true" className="size-4 text-amber-600" />
                {deadlineLabel(tor.deadline)}
              </p>
              <p data-numeric className="mt-2 text-lg font-medium">
                {deadlineText(tor.deadline, tor.status)}
              </p>
              {tor.deadline?.readByModel && (
                <p className="text-muted-foreground mt-1 text-xs">
                  อ่านจากเอกสาร TOR โดย AI — โปรดตรวจสอบกับเอกสารต้นฉบับก่อนตัดสินใจ
                </p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
  {!tor.publicationRemoval && <TorFavoriteButton projectId={tor.projectId} />}
              <TorDownloadButton projectId={tor.projectId} />
            </div>
            {!tor.publicationRemoval && <TorReportButton projectId={tor.projectId} />}
          </div>
        </div>
      </section>

      <section aria-labelledby="dates-heading" className="mt-6 pb-4">
        <SectionHeading id="dates-heading" title="กำหนดการสำคัญ" />
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <DateItem
            label="วันที่ประกาศ"
            value={
              tor.announcementDate
                ? formatThaiDate(tor.announcementDate)
                : 'ยังไม่มีข้อมูลวันที่ประกาศ'
            }
          />
        </div>
      </section>

      <section aria-labelledby="summary-heading" className="mt-10">
        <SectionHeading id="summary-heading" title="สรุปโครงการ" />
        <Card className="border-primary/20 bg-primary/5 mt-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles role="img" aria-label="สรุปโดย AI" className="text-primary size-4" />
              สรุปโครงการ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed">{tor.summary ?? 'ยังไม่มีข้อมูลการวิเคราะห์ TOR'}</p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="match-heading" className="mt-10">
        <SectionHeading id="match-heading" title="สรุปความเหมาะสมกับบริษัท" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]">
          <Card className="bg-primary text-primary-foreground overflow-hidden">
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="grid size-40 place-items-center rounded-full border-[14px] border-white/20 border-t-white">
                <div>
                  <p className="font-mono text-5xl leading-none font-medium">
                    {tor.matchScore === null ? '-' : `${tor.matchScore}%`}
                  </p>
                  <p className="mt-2 text-xs font-medium tracking-widest uppercase opacity-80">
                    Match
                  </p>
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

      <section aria-labelledby="details-heading" className="mt-10">
        <SectionHeading id="details-heading" title="รายละเอียดโครงการ" />
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <DetailList title="วัตถุประสงค์" items={tor.objectives} />
          <DetailList title="ขอบเขตงาน" items={tor.scope} />
          <DetailList title="คุณสมบัติผู้เสนอราคา" items={tor.bidderQualifications} />
        </div>
      </section>

      {tor.technologies.length > 0 && (
        <section aria-labelledby="technology-heading" className="mt-10">
          <SectionHeading id="technology-heading" title="เทคโนโลยีที่เกี่ยวข้อง" />
          <div className="mt-5 flex flex-wrap gap-3">
            {tor.technologies.map((technology) => (
              <Badge key={technology} variant="outline" className="px-3 py-1.5 text-sm">
                {technology}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <div>
      <h2 id={id} className="text-2xl font-semibold tracking-tight">
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

function DateItem({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-muted/60 flex items-center gap-4 rounded-xl px-4 py-3',
        urgent && 'border border-amber-200 dark:border-amber-900',
      )}
    >
      {urgent ? (
        <Clock3 aria-hidden="true" className="size-6 shrink-0 text-amber-600" />
      ) : (
        <CalendarDays aria-hidden="true" className="text-primary size-6 shrink-0" />
      )}
      <span>
        <span className="text-muted-foreground block text-xs">{label}</span>
        <span className="mt-0.5 block font-medium">{value}</span>
      </span>
    </div>
  );
}
