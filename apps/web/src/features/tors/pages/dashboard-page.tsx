import { TorGrid } from '@/components/tors/tor-grid';
import { getLatestTors } from '../queries';

const metrics = [
  { label: 'TOR ทั้งหมด', value: '124' },
  { label: 'TOR ใหม่', value: '17' },
  { label: 'TOR ที่มี % match สูง', value: '14' },
  { label: 'TOR ที่บันทึกไว้', value: '26' },
];

export async function DashboardPage() {
  const tors = await getLatestTors();
  return (
    <section className="mx-auto max-w-[1320px]">
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#121b2e] sm:text-4xl">
        แดชบอร์ด
      </h1>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[#e1e5ed] bg-white p-5 shadow-[0_1px_1px_rgba(31,41,66,0.03)]"
          >
            <p className="text-sm font-medium text-[#4a5669]">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172138]">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-xl font-semibold">ล่าสุด</h2>
      <div className="mt-4">
        <TorGrid tors={tors} />
      </div>
    </section>
  );
}
