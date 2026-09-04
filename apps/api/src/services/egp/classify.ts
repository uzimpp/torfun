import type { SoftwareClass } from '@torfun/types';

/**
 * Title heuristics for Thai procurement project names.
 *
 * These are heuristics over free text, not authoritative fields — good enough
 * to rank and triage a queue, not precise enough to quote as statistics. Two
 * known weaknesses, left documented rather than papered over:
 *
 *  - "โปรแกรม" is a Thai homonym: a software program *and* a programme of
 *    activities. Health-promotion tenders therefore over-count.
 *  - Software licence buys are often tendered as "จ้างเหมาบริการจัดหาสัญญา
 *    อนุญาต…", which reads as a build here but is really a purchase.
 */

/** Words that mean a computer system is involved. */
const SYSTEM_MARKERS = [
  'ระบบ', 'แอปพลิเคชัน', 'application', 'เว็บไซต์', 'website', 'ซอฟต์แวร์',
  'software', 'แพลตฟอร์ม', 'platform', 'โปรแกรม', 'ฐานข้อมูล', 'คลังข้อมูล',
  'ดิจิทัล', 'digital', 'chat bot', 'chatbot', 'line oa', ' ai ', 'api',
  'e-service', 'e-audit', 'สารสนเทศ', 'คอมพิวเตอร์',
];

/**
 * Thai uses "จ้างพัฒนา" for developing *anything* — capability, networks,
 * staff — so a training contract can look like a software one. The POC carried
 * a NON_SOFTWARE_MARKERS list for that case, but because an explicit system
 * marker overrides it, the list could never change an outcome. The absence of
 * a system marker already rejects those titles, so it is not reproduced here.
 */

/** Words that mean an existing system is being run, not built. */
const MAINTENANCE_MARKERS = [
  'บำรุงรักษา', 'ซ่อมแซม', 'ดูแลระบบ', 'ดูแลการใช้งาน', 'จ้างเหมาเอกชนดูแล',
  'เช่า', 'บริหารจัดการดูแล',
];

/** Names that read like genuine custom software builds. */
const SOFTWARE_TERMS = [
  'จ้างพัฒนา', 'ซอฟต์แวร์', 'แอปพลิเคชัน', 'แอปพลิเคชั่น',
  'ระบบสารสนเทศ', 'แพลตฟอร์ม', 'เว็บไซต์', 'ระบบงาน',
];

/** Names that read like hardware buys or pure O&M. */
const NON_SOFTWARE_TERMS = [
  'ครุภัณฑ์คอมพิวเตอร์', 'บำรุงรักษา', 'ซ่อมแซม', 'เช่าเครื่อง',
  'เช่าใช้', 'จัดซื้อเครื่อง', 'อุปกรณ์',
];

/**
 * Bucket a project title as new_build / oandm / not_software.
 *
 * Order matters: the non-software test runs first but is overridden by an
 * explicit system marker, so "จ้างพัฒนาศักยภาพภาคีเครือข่าย" (develop the
 * capability of partner networks) is rejected while "จ้างพัฒนาระบบบ่มเพาะ…"
 * (develop an incubation *system*) is kept.
 */
export function classifyProject(projectName: string): SoftwareClass {
  const name = (projectName ?? '').toLowerCase();
  const hasSystem = SYSTEM_MARKERS.some((marker) => name.includes(marker));

  // An explicit system marker OVERRIDES a non-software marker, which is why
  // this test is gated on !hasSystem rather than standing alone.
  if (!hasSystem) return 'not_software';
  if (MAINTENANCE_MARKERS.some((marker) => name.includes(marker))) return 'oandm';
  return 'new_build';
}

/**
 * Crude relevance score for "is this a custom software build?".
 *
 * Positive terms are weighted double so a name like
 * "จ้างพัฒนาระบบสารสนเทศ…บำรุงรักษา" — a build that also covers maintenance —
 * still outranks a pure hardware purchase.
 */
export function softwareScore(projectName: string): number {
  const name = projectName ?? '';
  const positive = SOFTWARE_TERMS.filter((term) => name.includes(term)).length;
  const negative = NON_SOFTWARE_TERMS.filter((term) => name.includes(term)).length;
  return 2 * positive - negative;
}
