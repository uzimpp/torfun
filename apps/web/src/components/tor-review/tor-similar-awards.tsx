'use client';

import type { SimilarAwardListed, SimilarAwards } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTorSimilarAwards } from './use-tor-similar-awards';

/**
 * Similar past awards found in open data by this TOR's NAME (#144; provisional, accepted
 * for the course MVP only and tried on two projects). Searched only when the button is
 * pressed, because a search spends the open-data API's daily allowance.
 *
 * The page shows what a reader came for: which past projects, who got the contract, at
 * what agreed price against the planned budget, and how many bid. Everything that
 * explains how the search was made, what was cut and what the data cannot say sits in one
 * closed "details" block, and the few things that must never be missed stay on the page in
 * one line each: a result was found by a similar NAME and is not confirmed to be the same
 * work; it is open data the system has not verified; the price is the agreed contract
 * price (never called a winning price); the data holds signed contracts only.
 */

const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (value: number) => `${baht.format(value)} บาท`;
const percent = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const when = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });

const GAP: Record<NonNullable<SimilarAwardListed['bidderCountGap']>, string> = {
  no_bids: 'ไม่มีข้อมูลผู้เสนอราคา',
  unnamed_bidder: 'นับผู้เสนอราคาไม่ได้ (มีผู้ไม่ระบุชื่อ)',
  several_years: 'นับผู้เสนอราคาไม่ได้ (ข้อมูลหลายปี)',
  year_without_contract: 'ไม่นับผู้เสนอราคา (ปีไม่ตรงกับสัญญา)',
};

const BIDDERS_STATE: Record<SimilarAwardListed['bidders'], string | null> = {
  read: null,
  none: 'ไม่มีข้อมูลผู้เสนอราคา',
  not_asked: 'ยังไม่ได้ดึงข้อมูลผู้เสนอราคา',
  failed: 'ดึงข้อมูลผู้เสนอราคาไม่สำเร็จ',
};

const EXCLUDED: [keyof SimilarAwards['excluded'], string][] = [
  ['ownProject', 'โครงการนี้เอง'],
  ['otherAgency', 'หน่วยงานไม่ตรงกัน'],
  ['notEBidding', 'ไม่ใช่ e-bidding'],
  ['noContractLines', 'ไม่มีรายการสัญญา'],
  ['torUndated', 'TOR นี้ไม่มีวันประกาศ'],
  ['undated', 'อ่านวันประกาศไม่ได้'],
  ['notEarlier', 'ประกาศไม่ก่อน TOR นี้'],
  ['malformed', 'ข้อมูลไม่สมบูรณ์'],
  ['duplicates', 'ซ้ำ'],
];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Listed({ item }: { item: SimilarAwardListed }) {
  const bidderText =
    item.bidderCount !== null
      ? `${item.bidderCount} ราย`
      : item.bidders === 'read' && item.bidderCountGap
        ? GAP[item.bidderCountGap]
        : BIDDERS_STATE[item.bidders];
  const prices = item.prices;

  return (
    <li className="grid gap-2 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{item.projectName}</p>
        <p className="text-muted-foreground text-xs">
          {item.deptName} · สัญญาปีงบประมาณ{' '}
          <span data-numeric>{item.contractYears.join(', ')}</span>
        </p>
      </div>

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <Fact label="งบประมาณที่ตั้งไว้">
          {item.budget === null ? (
            'ไม่ระบุ'
          ) : (
            <span data-numeric className="whitespace-nowrap">
              {money(item.budget)}
            </span>
          )}
        </Fact>
        <Fact label="ราคาตามสัญญา">
          {prices === null ? (
            <span className="text-muted-foreground">
              ไม่แสดง{' '}
              <span className="block text-xs">
                {item.bidderCount === null
                  ? '(ยังไม่ทราบจำนวนผู้เสนอราคา)'
                  : '(สัญญาไม่ใช่แบบเดียว รายการเดียว)'}
              </span>
            </span>
          ) : prices.agreedPrice === null ? (
            <span className="text-muted-foreground">ไม่ระบุ</span>
          ) : prices.agreedPriceUnusable ? (
            <span className="text-muted-foreground">
              <span data-numeric className="whitespace-nowrap">
                {money(prices.agreedPrice)}
              </span>{' '}
              (ใช้เทียบไม่ได้)
            </span>
          ) : (
            <>
              <span data-numeric className="whitespace-nowrap">
                {money(prices.agreedPrice)}
              </span>
              {prices.agreedToBudget !== null && (
                <span className="text-muted-foreground">
                  {' '}
                  (<span data-numeric>{percent.format(prices.agreedToBudget * 100)}%</span> ของงบ)
                </span>
              )}
            </>
          )}
        </Fact>
        <Fact label="ผู้เสนอราคา">
          <span className={item.bidderCount === null ? 'text-muted-foreground' : undefined}>
            {bidderText}
          </span>
        </Fact>
      </dl>

      <p className="flex flex-wrap items-center gap-2 text-sm">
        {item.winnerStatus === 'resolved' ? (
          <>
            <span>ผู้ได้รับสัญญา: {item.winners.map((winner) => winner.name).join(', ')}</span>
            {item.winners.some((winner) => winner.jointVenture) && (
              <Badge variant="outline">กิจการค้าร่วม</Badge>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">ยังระบุผู้ได้รับสัญญาไม่ได้</span>
        )}
      </p>

      {prices?.exceedsBudget && (
        <p className="text-muted-foreground text-xs">
          ราคาตามสัญญาสูงกว่างบที่ตั้งไว้ แสดงตามที่เผยแพร่ (ไม่ทราบสาเหตุ)
        </p>
      )}
    </li>
  );
}

function Competition({ result }: { result: SimilarAwards }) {
  const competition = result.competition;
  if (!competition) return null;

  if (competition.level && competition.bidders) {
    return (
      <p className="border-t pt-4 text-sm">
        <span className="font-medium">
          การแข่งขัน: {competition.level === 'few' ? 'น้อยราย' : 'มากราย'}
        </span>
        <span className="text-muted-foreground">
          {' '}
          (ผู้เสนอราคามัธยฐาน <span data-numeric>{competition.bidders.median}</span> ราย จาก{' '}
          <span data-numeric>{competition.withKnownBidderCount}</span> โครงการ · ดูจากอดีต
          ไม่ใช่การคาดการณ์ · อาจต่ำกว่าจริงเพราะมีเฉพาะสัญญาที่เซ็นแล้ว · เกณฑ์เป็นค่าชั่วคราว)
        </span>
      </p>
    );
  }
  return (
    <p className="text-muted-foreground border-t pt-4 text-sm">
      ยังสรุประดับการแข่งขันไม่ได้: ต้องมีอย่างน้อย{' '}
      <span data-numeric>{competition.minSample}</span> โครงการที่ทราบจำนวนผู้เสนอราคา (ตอนนี้{' '}
      <span data-numeric>{competition.withKnownBidderCount}</span>)
    </p>
  );
}

function Details({ result }: { result: SimilarAwards }) {
  const excluded = EXCLUDED.filter(([key]) => result.excluded[key] > 0);
  const competition = result.competition;

  return (
    <details className="text-muted-foreground text-xs">
      <summary className="cursor-pointer select-none">รายละเอียดการค้นและข้อจำกัดของข้อมูล</summary>
      <div className="mt-2 grid gap-2">
        <p>
          คำค้น: <span className="text-foreground">{result.keyword}</span>
        </p>
        <p data-numeric>
          {result.searches
            .map((search) =>
              search.outcome === 'read'
                ? `${search.year}: พบ ${search.total ?? 0}${search.truncated ? ' (อ่านบางส่วน)' : ''}`
                : `${search.year}: ${search.outcome === 'failed' ? 'ค้นไม่สำเร็จ' : 'ยังไม่ได้ค้น'}`,
            )
            .join(' · ')}
        </p>
        <p data-numeric>
          อ่าน {result.rowsRead} แถว เหลือ {result.projects} โครงการหลังกรอง
          {result.listed.length > 0 &&
            ` · แสดง ${result.listed.length} จาก ${result.closestCount} โครงการที่มีงบประมาณ เรียงตามงบใกล้ TOR นี้`}
          {result.withoutBudget > 0 && ` · ไม่แสดง ${result.withoutBudget} โครงการที่ไม่มีงบประมาณ`}
        </p>
        <p>
          การกรองหน่วยงานเดียวกัน วิธี e-bidding และวันประกาศ ลดผลที่ไม่เกี่ยวข้องเท่านั้น
          ไม่ได้พิสูจน์ว่าโครงการคล้ายกันหรือเป็นงานซอฟต์แวร์
        </p>
        {excluded.length > 0 && (
          <p data-numeric>
            ตัดออก: {excluded.map(([key, label]) => `${label} ${result.excluded[key]}`).join(' · ')}
          </p>
        )}
        {competition && (
          <p data-numeric>
            ฐานระดับการแข่งขัน: แสดง {competition.comparables} · มีข้อมูลสัญญา{' '}
            {competition.withContractData} · ระบุผู้ชนะได้ {competition.withResolvedWinner} ·
            ทราบจำนวนผู้เสนอราคา {competition.withKnownBidderCount} · มีตัวเลขราคา{' '}
            {competition.clean}
            {competition.level &&
              ` · น้อยราย ${competition.bidders?.few ?? 0} มากราย ${competition.bidders?.many ?? 0} (เกณฑ์ ${competition.thresholds.fewMax} ราย)`}
          </p>
        )}
        <ul className="list-disc space-y-1 ps-5">
          <li>
            งบประมาณคือวงเงินที่หน่วยงานตั้งไว้ ราคาตามสัญญาคือราคาที่ตกลงในสัญญา
            ไม่ใช่ราคาที่ควรเสนอ
          </li>
          <li>
            มีเฉพาะสัญญาที่เซ็นแล้ว งานที่ยกเลิกหรือไม่มีผู้เสนอจะไม่ปรากฏ
            จำนวนผู้เสนอจึงอาจต่ำกว่าจริง
          </li>
          <li>
            นับผู้เสนอราคาตามชื่อที่เหมือนกันทุกตัวอักษร ไม่ตัดสิทธิ์ ไม่รวมชื่อสะกดต่าง
            จึงอาจสูงกว่าจริง
          </li>
          <li>ข้อมูลผู้เสนอราคาอาจไม่มีสำหรับปีเก่า</li>
          <li>ราคาแสดงเฉพาะโครงการที่มีสัญญาเดียว รายการเดียว และทราบจำนวนผู้เสนอราคา</li>
        </ul>
        {result.fetchedAt && (
          <p>
            {result.cached ? 'ผลนี้เก็บไว้ชั่วคราวที่เซิร์ฟเวอร์ · ค้นเมื่อ ' : 'ค้นเมื่อ '}
            <span data-numeric>{when(result.fetchedAt)}</span>
          </p>
        )}
      </div>
    </details>
  );
}

function Result({ result }: { result: SimilarAwards }) {
  if (result.status === 'not_offered') {
    return (
      <p className="text-muted-foreground text-sm">
        ส่วนนี้ใช้กับ TOR ที่เจ้าหน้าที่เห็นได้เท่านั้น
      </p>
    );
  }
  if (result.status === 'no_keyword') {
    return (
      <p className="text-muted-foreground text-sm">
        ชื่อโครงการนี้{result.keywordSkipped === 'too_short' ? 'สั้นเกินไป' : 'กว้างเกินไป'}
        ที่จะค้นได้อย่างมีความหมาย จึงไม่ได้ค้น
      </p>
    );
  }
  if (result.status === 'cooling_down') {
    return (
      <p className="text-muted-foreground text-sm">
        ยังค้นไม่ได้ในตอนนี้ (ระบบพักการดึงข้อมูลชั่วคราว) ลองใหม่ภายหลัง
        {result.cooldownUntil && (
          <>
            {' '}
            · พักถึง <span data-numeric>{when(result.cooldownUntil)}</span>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {!result.complete && (
        <p className="text-sm">ค้นได้ไม่ครบ (บางการเรียกไม่สำเร็จหรือถึงเพดาน) ผลอาจน้อยกว่าจริง</p>
      )}

      {result.listed.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {result.ownBudget === null
            ? 'TOR นี้ไม่มีงบประมาณที่ตั้งไว้ จึงเรียงโครงการเทียบไม่ได้'
            : 'ไม่พบโครงการคล้ายกันในสัญญาที่เซ็นแล้วของหน่วยงานเดียวกัน 3 ปีงบประมาณล่าสุด ไม่ได้แปลว่าไม่มีคู่แข่ง'}
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {result.listed.map((item) => (
            <Listed key={item.projectId} item={item} />
          ))}
        </ul>
      )}

      <Competition result={result} />
      <Details result={result} />
    </div>
  );
}

export function TorSimilarAwards({ projectId }: { projectId: string }) {
  const { state, search } = useTorSimilarAwards(projectId);
  const loading = state.status === 'loading';

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          ผู้ได้รับสัญญา ราคา และผู้เสนอราคาในอดีต
          <Badge variant="outline">ทดลอง</Badge>
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          ค้นจากชื่อโครงการในข้อมูลสัญญาจัดซื้อจัดจ้างภาครัฐที่เซ็นแล้ว พบจากชื่อที่คล้ายกัน
          ไม่ยืนยันว่าเป็นงานเดียวกันหรือเป็นซอฟต์แวร์ และระบบไม่ได้ตรวจสอบข้อมูล
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <Button
            type="button"
            size="sm"
            onClick={search}
            disabled={loading}
            title="การค้นเรียกใช้โควตาการดึงข้อมูลรายวันและอาจใช้เวลาหลายวินาที"
          >
            {loading
              ? 'กำลังค้นหา...'
              : state.status === 'ready'
                ? 'ค้นหาอีกครั้ง'
                : 'ค้นหาโครงการคล้ายกัน'}
          </Button>
        </div>

        {loading && (
          <p role="status" className="text-muted-foreground text-sm">
            กำลังค้นหา
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="text-sm">
            ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง
          </p>
        )}
        {state.status === 'ready' && <Result result={state.result} />}
      </CardContent>
    </Card>
  );
}
