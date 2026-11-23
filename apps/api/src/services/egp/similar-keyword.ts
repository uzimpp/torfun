/**
 * The search keyword for #144's name-based discovery (provisional, accepted for the
 * course MVP only). Pure: it reads a stored project name and returns text; it
 * calls nothing and decides nothing about what the work is.
 *
 * Open data's `egp-contract` takes a `keyword` that matches inside a project's name.
 * A name as stored carries a procedure prefix, a method tail and sometimes the agency,
 * a location or a quantity, none of which describe the work, and some of which change
 * from year to year (an earlier year's title may add "ค่า" after the verb). The rules
 * below cut those and keep the middle.
 *
 * PROVISIONAL, and shown to work on two projects only. The rules were written after
 * seeing the results for those two, no set held back from writing them has been
 * tested, and nothing was measured about false or missed matches. Known weaknesses,
 * read from keyword forms and not measured: a verb such as "จัดหา" is not cut; a quantity in the middle of a name
 * stays; a street or number ending ("ซอยสุขุมวิท 38") can match longer numbers.
 *
 * A keyword says nothing about similarity or about software work. A title is not a
 * verdict (AGENTS.md): whether a result is comparable is for a person to judge.
 */

/** R6: a generated keyword shorter than this is no keyword at all. */
export const KEYWORD_MIN_GENERATED_LENGTH = 8;

/**
 * PROVISIONAL guard, untested: a keyword shorter than this is too generic to search
 * (for example "ครุภัณฑ์"), because it would return a great many unrelated rows.
 */
export const KEYWORD_MIN_SEARCH_LENGTH = 20;

const THAI_DIGITS = '๐-๙';

/** R1: the method tail, from "ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์" to the end. */
const METHOD_TAIL = /\s*ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์.*$/;
/** R1: a re-run marker, "(ครั้งที่ 2)", anywhere in the name, in either kind of digit. */
const RERUN_MARK = new RegExp(`\\s*\\(ครั้งที่\\s*[\\d${THAI_DIGITS}]+\\)`, 'g');
/** R2: the procedure word at the start. */
const PROCEDURE_PREFIX = /^ประกวดราคา/;
/** R2: the verb at the start, as many as are stacked (order matters: longest first). */
const VERB_PREFIX = /^(จ้างจ้างเหมา|จ้างเหมา|จ้าง|ซื้อจัดซื้อ|จัดซื้อ|ซื้อ|จัดจ้าง)+/;
/** R3: filler left at the start once the verb is gone. */
const FILLER_PREFIX = /^(ค่าใช้จ่ายในการ|ค่า|โครงการ)+/;
/** R4: a location word, and everything after it. */
const LOCATION_TAIL = /\s(แขวง|ตำบล|เขต|อำเภอ)/;
/** R5: a quantity at the very end, such as "1 โครงการ" or "จำนวน ๓ ตู้". */
const QUANTITY_TAIL = new RegExp(
  `\\s*(จำนวน\\s*)?[\\d${THAI_DIGITS},]+\\s*(โครงการ|รายการ|แห่ง|เครื่อง|ตู้|ระบบ|ชุด|คัน|หลัง)\\s*$`,
);
/** R5 is applied this many times, so "... 2 รายการ 1 โครงการ" loses both. */
const QUANTITY_PASSES = 3;

export interface SimilarKeyword {
  /** What rules R1 to R5 left, trimmed. Kept even when it is not searched, so a caller can say why. */
  generated: string;
  /** The text to search for, or null when it must not be searched. */
  keyword: string | null;
  /**
   * Why there is no keyword: `too_short` (R6, under 8 characters) or `too_generic`
   * (under 20, the provisional search guard). Null when there is one.
   */
  skipped: 'too_short' | 'too_generic' | null;
}

/**
 * The keyword for a project's stored name. `deptName` is the stored agency name, cut
 * from the name where the name repeats it (R4); the location words are cut either way.
 */
export function buildSimilarKeyword(projectName: string, deptName?: string | null): SimilarKeyword {
  // Trimmed first: the prefix rules anchor at the start, so a leading space would defeat them.
  let text = projectName.trim();
  text = text.replace(METHOD_TAIL, '').replace(RERUN_MARK, '');
  text = text.replace(PROCEDURE_PREFIX, '').replace(VERB_PREFIX, '');
  text = text.replace(FILLER_PREFIX, '');

  const agency = deptName?.trim();
  if (agency) text = text.split(` ${agency}`)[0]!;
  text = text.split(LOCATION_TAIL)[0]!;

  for (let pass = 0; pass < QUANTITY_PASSES; pass += 1) {
    text = text.replace(QUANTITY_TAIL, '');
  }

  const generated = text.trim();
  if (generated.length < KEYWORD_MIN_GENERATED_LENGTH) {
    return { generated, keyword: null, skipped: 'too_short' };
  }
  if (generated.length < KEYWORD_MIN_SEARCH_LENGTH) {
    return { generated, keyword: null, skipped: 'too_generic' };
  }
  return { generated, keyword: generated, skipped: null };
}
