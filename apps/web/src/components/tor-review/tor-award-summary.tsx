import type { AwardEntry, AwardSummary, WinnerBidUnavailable } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Who won a procurement, at what agreed price, and who bid what (#142), as the
 * open-data API published it. It takes the summary as a prop. On the detail page
 * (`TorAwardSection`) it is fed only contract lines whose project id equals the
 * procurement's own, exactly; the link between the two sites' ids is partially
 * confirmed, not fully verified (ADR-0022, rule 6), which is why every figure is
 * labelled open data to check.
 *
 * Submitted bid prices and the agreed contract price are different numbers and
 * are kept in different blocks, never compared into a "winning price". Every
 * figure says it is open data to verify. A winner it could not resolve is said
 * to be unresolved, with the lines as published.
 */

const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = (value: number | null) => (value === null ? 'ไม่ระบุ' : `${baht.format(value)} บาท`);

const WINNER_BID_UNAVAILABLE: Record<WinnerBidUnavailable, string | null> = {
  unresolved_winner: null,
  no_bids: null,
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
          {structure.reason === 'unnumbered_lines'
            ? 'มีหลายรายการสัญญาที่ไม่ระบุเลขที่สัญญา จึงแยกไม่ได้ว่าใครเป็นผู้ชนะ'
            : 'สัญญาเลขที่เดียวกันมีหลายรายการที่แยกไม่ชัดเจนว่าเป็นกิจการค้าร่วมกับสมาชิกหรือไม่'}{' '}
          แสดงตามที่ open data เผยแพร่:
        </p>
        <ul className="text-muted-foreground space-y-1 ps-5 text-sm">
          {structure.contracts.map((contract, index) => (
            <li
              key={`${contract.contractNo}-${index}`}
              className="flex flex-wrap items-baseline justify-between gap-2"
            >
              <span>{contract.winnerName ?? 'ไม่ระบุชื่อ'}</span>
              <span data-numeric>{money(contract.priceAgree)}</span>
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
        <span className="text-sm font-medium">{award.winnerName ?? 'ไม่ระบุชื่อผู้ชนะ'}</span>
        {structure.kind === 'joint_venture' && <Badge variant="outline">กิจการค้าร่วม</Badge>}
        {structure.kind === 'single' && structure.contract.contractNo && (
          <span className="text-muted-foreground text-xs">
            สัญญาเลขที่ {structure.contract.contractNo}
          </span>
        )}
      </div>
      {structure.kind === 'joint_venture' && structure.members.length > 0 && (
        <p className="text-muted-foreground text-sm">
          สมาชิก: {structure.members.map((member) => member.winnerName ?? 'ไม่ระบุชื่อ').join(', ')}
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

  const winners = new Set(
    award.awards.flatMap((entry) =>
      entry.winnerBid && entry.winnerName ? [entry.winnerName] : [],
    ),
  );
  const severalItems = award.items.length > 1;

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">ผู้ชนะและราคาจาก open data</CardTitle>
        <p className="text-muted-foreground text-sm">
          ข้อมูลจาก open data (GovSpending)
          {award.contractYear !== null && ` ปีงบประมาณที่ทำสัญญา ${award.contractYear}`}{' '}
          ระบบไม่ได้ยืนยันความถูกต้อง โปรดตรวจสอบกับเอกสารต้นฉบับก่อนตัดสินใจเสนอราคา
        </p>
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
            <Figure label="ราคาที่ตกลงรวม (ตามที่ open data เผยแพร่)" value={award.sumPriceAgree} />
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
              <p className="text-sm">
                {award.bidderCount === null
                  ? 'ไม่ทราบจำนวนผู้เสนอราคาที่แน่ชัด'
                  : `ผู้เสนอราคา ${award.bidderCount} ราย`}
              </p>
              {award.items.map((item, index) => (
                <div key={`${item.seqNo}-${index}`} className="grid gap-2">
                  {severalItems && (
                    <p className="text-sm font-medium">
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
                          {bid.merchantName ?? 'ไม่ระบุชื่อ'}
                          {bid.merchantName !== null &&
                            winners.has(bid.merchantName) &&
                            !severalItems && (
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
