import {
  isNamed,
  type AwardEntry,
  type AwardStructure,
  type AwardSummary,
  type WinnerBidUnavailable,
} from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Who won a procurement, at what agreed price, and who bid what (#142), as the
 * open-data API published it. It takes the summary as a prop. On the detail page
 * (`TorAwardSection`) it is fed only contract lines whose project id equals the
 * procurement's own, exactly; the link between the two sites' ids is partially
 * confirmed, not fully verified, which is why every figure is
 * labelled open data to check.
 *
 * Submitted bid prices and the agreed contract price are different numbers and
 * are kept in different blocks, never compared into a "winning price". Every
 * figure says it is open data to verify. A winner it could not resolve is said
 * to be unresolved, with the lines as published.
 */

const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (value: number | null) => (value === null ? 'ไม่ระบุ' : `${baht.format(value)} บาท`);

/** A name as published, or `missing` where it is null, empty or only spaces (the same test the summary uses). */
const nameOr = (name: string | null, missing: string) => (isNamed(name) ? name : missing);

/** One contract line's own contract fiscal year, as the API published it; never derived from a date. */
const contractYearText = (year: number) => `ทำสัญญาปีงบประมาณ ${year}`;

const UNRESOLVED_REASON: Record<Extract<AwardStructure, { kind: 'unresolved' }>['reason'], string> =
  {
    unnumbered_lines: 'มีหลายรายการสัญญาที่ไม่ระบุเลขที่สัญญา จึงแยกไม่ได้ว่าใครเป็นผู้ชนะ',
    ambiguous_lines:
      'สัญญาเลขที่เดียวกันมีหลายรายการที่แยกไม่ชัดเจนว่าเป็นกิจการค้าร่วมกับสมาชิกหรือไม่',
    number_in_other_year:
      'เลขที่สัญญานี้ปรากฏในปีงบประมาณอื่นด้วย จึงแยกไม่ได้ว่าเป็นสัญญาของตัวเอง หรือเป็นสมาชิกหรือกิจการค้าร่วมที่มีรายการอยู่อีกปี ระบบไม่รวมข้ามปีและไม่ระบุผู้ชนะ',
  };

/**
 * Beside an amount listed where the winner is not determined by reason of a number used in
 * another year: the line's own published amount, not a price anyone is said to have won at.
 */
const UNCONFIRMED_AMOUNT_LABEL =
  'จำนวนเงินในรายการนี้ (ตามที่เผยแพร่ ยังไม่ยืนยันว่าเป็นราคาของผู้ชนะ)';

const WINNER_BID_UNAVAILABLE: Record<WinnerBidUnavailable, string | null> = {
  unresolved_winner: null,
  no_bids: null,
  bids_in_other_year:
    'ไม่แสดงราคาที่ผู้ชนะยื่น เพราะข้อมูลผู้เสนอราคาที่เก็บไว้เป็นของปีงบประมาณอื่น ไม่ใช่ปีของสัญญานี้',
  multi_item:
    'ไม่แสดงราคาที่ผู้ชนะยื่น เพราะโครงการมีหลายรายการและไม่ทราบว่าสัญญานี้ครอบคลุมรายการใด',
  no_exact_match: 'ไม่พบราคาที่ผู้ชนะยื่นภายใต้ชื่อที่ตรงกันทุกตัวอักษร',
};

function Figure({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-numeric>{money(value)}</dd>
    </div>
  );
}

function Award({ award }: { award: AwardEntry }) {
  const { structure } = award;
  if (structure.kind === 'unresolved') {
    return (
      <li className="grid gap-2 py-4 first:pt-0 last:pb-0">
        <p className="text-sm font-medium">ยังระบุผู้ชนะไม่ได้</p>
        <p className="text-muted-foreground text-sm">
          {UNRESOLVED_REASON[structure.reason]} แสดงตามที่เผยแพร่:
        </p>
        <ul className="text-muted-foreground space-y-1 ps-5 text-sm">
          {structure.contracts.map((contract, index) => (
            <li
              key={`${contract.contractNo}-${index}`}
              className="flex flex-wrap items-baseline justify-between gap-2"
            >
              <span>
                {nameOr(contract.winnerName, 'ไม่ระบุชื่อ')}
                <span className="ms-2 text-xs">{contractYearText(contract.contractYear)}</span>
              </span>
              <span className="text-end">
                <span data-numeric>{money(contract.priceAgree)}</span>
                {structure.reason === 'number_in_other_year' && (
                  <span className="block text-xs">{UNCONFIRMED_AMOUNT_LABEL}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </li>
    );
  }

  const unavailable = award.winnerBidUnavailable
    ? WINNER_BID_UNAVAILABLE[award.winnerBidUnavailable]
    : null;
  return (
    <li className="grid gap-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{nameOr(award.winnerName, 'ไม่ระบุชื่อผู้ชนะ')}</span>
        {structure.kind === 'joint_venture' && <Badge variant="outline">กิจการค้าร่วม</Badge>}
        {structure.kind === 'single' && structure.contract.contractNo && (
          <span className="text-muted-foreground text-xs">
            สัญญาเลขที่ {structure.contract.contractNo}
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          {contractYearText(
            structure.kind === 'single'
              ? structure.contract.contractYear
              : structure.consortium.contractYear,
          )}
        </span>
      </div>
      {structure.kind === 'joint_venture' && structure.members.length > 0 && (
        <p className="text-muted-foreground text-sm">
          สมาชิก:{' '}
          {structure.members.map((member) => nameOr(member.winnerName, 'ไม่ระบุชื่อ')).join(', ')}
        </p>
      )}
      <dl className="grid gap-1">
        <Figure label="ราคาที่ตกลงตามสัญญา" value={award.agreedContractPrice} />
        {award.winnerBid && (
          <Figure
            label="ราคาที่ผู้ชนะยื่น (จับคู่จากชื่อ)"
            value={award.winnerBid.submittedPrice}
          />
        )}
      </dl>
      {award.winnerBid?.lowerBids !== null && award.winnerBid?.lowerBids !== undefined && (
        <p className="text-muted-foreground text-xs">
          {award.winnerBid.lowerBids === 0
            ? 'ไม่มีผู้เสนอราคาต่ำกว่าผู้ชนะ'
            : `มีผู้เสนอราคาต่ำกว่าผู้ชนะ ${award.winnerBid.lowerBids} ราย`}
        </p>
      )}
      {unavailable && <p className="text-muted-foreground text-xs">{unavailable}</p>}
    </li>
  );
}

export function TorAwardSummary({ award }: { award: AwardSummary | null }) {
  if (award === null || (award.status === 'none' && award.items.length === 0)) {
    return (
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">ยังไม่มีข้อมูลผู้ชนะและราคา</CardTitle>
          <p className="text-muted-foreground text-sm">
            ยังไม่มีข้อมูลสัญญาที่ TORfun เก็บไว้สำหรับโครงการนี้
          </p>
        </CardHeader>
      </Card>
    );
  }

  // A winner is marked only among the bids of its own contract line's year. `winnerBid` is
  // set only when that year has a single item, so the mark is never a guess between items.
  const winnersByYear = new Map<number, Set<string>>();
  for (const entry of award.awards) {
    const { structure } = entry;
    if (!entry.winnerBid || !isNamed(entry.winnerName) || structure.kind === 'unresolved') continue;
    const year =
      structure.kind === 'single'
        ? structure.contract.contractYear
        : structure.consortium.contractYear;
    winnersByYear.set(year, (winnersByYear.get(year) ?? new Set<string>()).add(entry.winnerName));
  }
  const severalItems = award.items.length > 1;
  const severalYears = award.bidYears.length > 1;

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">ผู้ชนะและราคาของโครงการนี้</CardTitle>
        <p className="text-muted-foreground text-sm">
          ข้อมูลสัญญาจัดซื้อจัดจ้างภาครัฐ
          {award.contractYear !== null && ` ปีงบประมาณที่ทำสัญญา ${award.contractYear}`}{' '}
          ระบบไม่ได้ยืนยันความถูกต้อง โปรดตรวจสอบกับเอกสารต้นฉบับก่อนตัดสินใจเสนอราคา
        </p>
        {award.contractYear === null && award.awards.length > 0 && (
          <p className="text-xs">
            พบสัญญาหลายปีงบประมาณภายใต้เลขโครงการนี้ ดูปีงบประมาณที่ทำสัญญาในแต่ละรายการ
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          จับคู่กับโครงการนี้ด้วยเลขโครงการที่ตรงกันเท่านั้น และยังยืนยันไม่ครบทุกกรณี เช่น
          โครงการที่ประกาศซ้ำหรือสัญญาข้ามปี
        </p>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section aria-labelledby="award-contract-heading" className="grid gap-3">
          <h3 id="award-contract-heading" className="text-sm font-semibold">
            ผู้ชนะและราคาที่ตกลงตามสัญญา
          </h3>
          {award.awards.length === 0 ? (
            <p className="text-muted-foreground text-sm">ไม่พบข้อมูลสัญญาของโครงการนี้</p>
          ) : (
            <ul className="divide-border divide-y">
              {award.awards.map((entry, index) => (
                <Award key={index} award={entry} />
              ))}
            </ul>
          )}
          <dl className="border-border grid gap-1 border-t pt-3">
            <Figure label="วงเงินงบประมาณ" value={award.projectMoney} />
            <Figure label="ราคากลาง" value={award.priceBuild} />
            <Figure label="ราคาที่ตกลงรวม (ตามที่เผยแพร่)" value={award.sumPriceAgree} />
          </dl>
        </section>

        <section aria-labelledby="award-bids-heading" className="grid gap-3">
          <h3 id="award-bids-heading" className="text-sm font-semibold">
            ราคาที่ผู้เสนอราคายื่น
          </h3>
          <p className="text-muted-foreground text-xs">
            ราคาที่ยื่นกับราคาที่ตกลงตามสัญญาเป็นคนละตัวเลข และอาจต่างกันได้
          </p>
          {award.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">ไม่พบข้อมูลผู้เสนอราคา</p>
          ) : (
            <>
              {severalYears ? (
                <div className="grid gap-1 text-sm">
                  <p>ผู้เสนอราคาแยกตามปีงบประมาณที่ทำสัญญา (ไม่รวมข้ามปี)</p>
                  <ul className="text-muted-foreground ps-5">
                    {award.bidYears.map((year) => (
                      <li key={year.contractYear}>
                        {`ปีงบประมาณ ${year.contractYear}: `}
                        {year.bidderCount === null
                          ? 'ไม่ทราบจำนวนที่แน่ชัด'
                          : `${year.bidderCount} ราย`}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground text-xs">
                    ปีของราคาที่ยื่นมาจากปีที่ระบบส่งไปขอข้อมูล (ข้อมูลของผู้เสนอราคาไม่มีปีมาด้วย)
                    และยังยืนยันไม่ได้ว่าข้อมูลที่เผยแพร่แยกผู้เสนอราคาตามปีจริง
                  </p>
                </div>
              ) : (
                <p className="text-sm">
                  {award.bidderCount === null
                    ? 'ไม่ทราบจำนวนผู้เสนอราคาที่แน่ชัด'
                    : `ผู้เสนอราคา ${award.bidderCount} ราย`}
                  {award.bidYears.some((year) => !year.hasContractLine) && (
                    <span className="text-muted-foreground block text-xs">
                      ข้อมูลผู้เสนอราคาเป็นของปีงบประมาณที่โครงการนี้ไม่มีรายการสัญญา
                      จึงไม่นับเป็นผู้เสนอราคาของสัญญา
                    </span>
                  )}
                </p>
              )}
              {award.items.map((item, index) => (
                <div key={`${item.contractYear}-${item.seqNo}-${index}`} className="grid gap-2">
                  {(severalItems || severalYears) && (
                    <p className="text-sm font-medium">
                      {severalYears && contractYearText(item.contractYear)}
                      {severalYears && item.seqNo !== null && ' · '}
                      {item.seqNo !== null && `รายการที่ ${item.seqNo}`}
                      {item.description && ` · ${item.description}`}
                    </p>
                  )}
                  <ul className="divide-border divide-y text-sm">
                    {item.bids.map((bid, bidIndex) => (
                      <li
                        key={`${bid.merchantName}-${bidIndex}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"
                      >
                        <span>
                          {nameOr(bid.merchantName, 'ไม่ระบุชื่อ')}
                          {isNamed(bid.merchantName) &&
                            winnersByYear.get(item.contractYear)?.has(bid.merchantName) && (
                              <Badge variant="outline" className="ms-2">
                                ผู้ชนะ
                              </Badge>
                            )}
                        </span>
                        <span data-numeric>{money(bid.submittedPrice)}</span>
                      </li>
                    ))}
                  </ul>
                  {item.pricedBids > 0 && (
                    <p className="text-muted-foreground text-xs" data-numeric>
                      ต่ำสุด {money(item.lowest)} · เฉลี่ย {money(item.average)} · สูงสุด{' '}
                      {money(item.highest)}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
