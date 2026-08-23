import { EmptyState } from '@/components/states/empty-state';
import { TorGrid } from '@/components/tors/tor-grid';
import { getFavoriteTors } from '@/features/tors/queries';

export default async function MyTorsPage() {
  const tors = await getFavoriteTors();
  return (
    <section className="mx-auto max-w-[1320px]">
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#121b2e] sm:text-4xl">
        TOR ของฉัน
      </h1>
      <p className="mt-2 text-sm text-[#68758a]">รายการที่คุณบันทึกไว้เพื่อติดตาม</p>
      <div className="mt-7">
        {tors.length ? (
          <TorGrid tors={tors} />
        ) : (
          <EmptyState
            title="ยังไม่มี TOR ที่บันทึกไว้"
            description="บันทึก TOR ที่สนใจจากหน้าค้นหาเพื่อกลับมาติดตามภายหลัง"
          />
        )}
      </div>
    </section>
  );
}
