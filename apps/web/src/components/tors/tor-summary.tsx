import type { TorDetailSummary } from '@/features/tors/types';

export function TorSummary({ summary }: { summary: TorDetailSummary }) {
  return (
    <section
      aria-labelledby="tor-summary-heading"
      className="mt-7 rounded-xl border border-[#e1e5ed] bg-white p-6 shadow-[0_1px_1px_rgba(31,41,66,0.03)] sm:p-8"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="tor-summary-heading" className="text-xl font-semibold text-[#172138]">
          สรุป TOR
        </h2>
        <span className="rounded-full bg-[#f1f4f8] px-2.5 py-1 text-xs font-medium text-[#657287]">
          ข้อมูลตัวอย่างสำหรับเดโม
        </span>
      </div>
      <p className="mt-4 max-w-4xl leading-7 text-[#566378]">{summary.overview}</p>
      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <SummaryList title="วัตถุประสงค์โครงการ" items={summary.objectives} />
        <SummaryList title="ขอบเขตงาน" items={summary.scope} />
      </div>
      <div className="mt-7 grid gap-7 border-t border-[#e5e8ee] pt-7 lg:grid-cols-2">
        <SummaryList title="สิ่งที่ต้องส่งมอบ" items={summary.deliverables} />
        <SummaryList title="คุณสมบัติผู้เสนอราคา" items={summary.qualifications} />
      </div>
    </section>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-semibold text-[#27334a]">{title}</h3>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#5e6a7e]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#6a86af]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
