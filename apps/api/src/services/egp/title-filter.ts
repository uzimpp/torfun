/**
 * A cheap, conservative screen on a feed item's title, run before anything is
 * read about the project. It exists to spare e-GP requests (the project's
 * detail, then its archive) and Vertex calls on work that is plainly not
 * software: lifts, laundry, road markings, air-conditioners, construction.
 *
 * It is a screen, not a verdict (see ADR-0014 and AGENTS.md). It is built to
 * miss rather than to over-reach: a title it lets through is judged from the
 * TOR as before, and a title it drops is gone from the queue, so every rule
 * errs toward letting a project through.
 *
 *  1. The buyer's name is masked first. "การไฟฟ้า…" and "การประปา…" are agencies
 *     that buy software too, and a place name such as "คลองประปา" says nothing
 *     about the work.
 *  2. A software word anywhere in the title vetoes the drop. It is looked for in
 *     the whole title, not the masked one, so masking cannot hide it.
 *  3. Only then does a deny term decide. Terms name the work (a lift, a road
 *     marking), never a bare material such as ไฟฟ้า.
 *
 * Calibrated on the titles of 54 projects that reached the model: it caught 31
 * of the 40 the model rejected and none of the 13 it kept.
 */

export const TITLE_FILTER_MODES = ['off', 'shadow', 'on'] as const;
/** `off` reads no title; `shadow` finds what would be dropped and only reports it; `on` drops it. */
export type TitleFilterMode = (typeof TITLE_FILTER_MODES)[number];

/** Parts of a title that name who is buying or where, not what is bought. */
const BUYER_AND_PLACE_MASKS: readonly RegExp[] = [
  /การไฟฟ้า(ส่วนภูมิภาค|นครหลวง|ฝ่ายผลิตแห่งประเทศไทย)?/g,
  /การประปา(ส่วนภูมิภาค|นครหลวง)?/g,
  /ไฟฟ้า(ส่วนภูมิภาค|นครหลวง)/g,
  /ประปา(ส่วนภูมิภาค|นครหลวง)/g,
  /คลองประปา/g,
  /แม่เหล็กไฟฟ้า/g,
];

/** Any of these in the title means it may be software work; the title is left alone. */
const SOFTWARE_WORDS: readonly string[] = [
  'สารสนเทศ',
  'ซอฟต์แวร์',
  'โปรแกรม',
  'ดิจิทัล',
  'ดิจิตอล',
  'เครือข่าย',
  'คอมพิวเตอร์',
  'แอปพลิเคชัน',
  'แอพพลิเคชัน',
  'เว็บไซต์',
  'ฐานข้อมูล',
  'ปัญญาประดิษฐ์',
  'sms',
  'software',
  'application',
  'website',
  'platform',
  'api',
  'cloud',
];

/**
 * Terms that name work which is not software, each with the label reported when
 * it decides. A term is a regular expression so it can refuse its look-alikes
 * (เรือน, as in เรือนจำ, is a building, not a boat).
 */
const DENY_TERMS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  // Facilities and roads
  ['จราจร', /จราจร/],
  ['ป้ายจราจร', /ป้ายจราจร|ป้ายแขวน/],
  ['ลิฟต์', /ลิฟ[ทต]?/],
  ['บันไดเลื่อน', /บันไดเลื่อน/],
  ['ปรับอากาศ', /ปรับอากาศ/],
  ['ระบบวิศวกรรม', /ระบบวิศวกรรม/],
  ['ทำความสะอาด', /ทำความสะอาด/],
  ['ซ่อมแซม', /ซ่อมแซม/],
  ['ซ่อมบำรุง', /ซ่อมบำรุง/],
  ['เรือ', /เรือ(?!น)/],
  // Goods and services of another kind
  ['ผ้า', /ผ้า/],
  ['เครื่องแบบ', /เครื่องแบบ|เครื่องแต่งกาย|ตัดเย็บ/],
  ['อาหาร', /อาหาร/],
  ['ตรวจวิเคราะห์', /ตรวจวิเคราะห์/],
  ['หัตถการ', /หัตถการ/],
  ['กระดาษต่อเนื่อง', /กระดาษต่อเนื่อง/],
  ['ห้องเรียน', /ห้องเรียน/],
  // Construction
  ['ก่อสร้าง', /ก่อสร้าง/],
  ['ถนน', /ถนน/],
  // Utilities, as work or as a bill; never the bare word
  ['งานไฟฟ้า', /ระบบไฟฟ้า|งานไฟฟ้า|สายไฟฟ้า|ค่าไฟฟ้า/],
  ['งานประปา', /ระบบประปา|งานประปา|ค่าน้ำประปา/],
];

/**
 * The deny term that rules this title out, or null if it should go on. The
 * agency is masked too, wherever its name is repeated in the title.
 */
export function titleExclusion(title: string, deptName = ''): string | null {
  const lower = title.toLowerCase();
  if (SOFTWARE_WORDS.some((word) => lower.includes(word))) return null;

  let masked = title;
  if (deptName) masked = masked.split(deptName).join(' ');
  for (const mask of BUYER_AND_PLACE_MASKS) masked = masked.replace(mask, ' ');

  const hit = DENY_TERMS.find(([, pattern]) => pattern.test(masked));
  return hit ? hit[0] : null;
}
