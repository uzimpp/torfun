import type {
  ClientKind,
  DurationUnit,
  EvaluationDocument,
  EvaluationMethod,
  TargetPlatform,
} from '@torfun/types';

/**
 * Storage values are English enums shared with the TOR side (ADR-0009); these
 * are what a person reads. Kept in one file so the list, the form and the
 * grouping headers cannot drift apart.
 */

export const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  macos: 'macOS',
  windows: 'Windows',
  mobile: 'มือถือ',
  web_app: 'เว็บแอปพลิเคชัน',
  other: 'อื่น ๆ',
};

/** Ordered for the toggle row; the enum itself carries no order. */
export const PLATFORM_ORDER: TargetPlatform[] = ['web_app', 'mobile', 'windows', 'macos', 'other'];

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  government: 'หน่วยงานรัฐ',
  private: 'เอกชน',
};

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  months: 'เดือน',
  years: 'ปี',
};

/**
 * How the winner is chosen (#143). UNVALIDATED wording: written from the usual
 * Thai e-bidding terms without a real document to check it against.
 */
export const EVALUATION_METHOD_LABELS: Record<EvaluationMethod, string> = {
  lowest_price: 'เกณฑ์ราคา',
  price_performance: 'เกณฑ์ราคาประกอบเกณฑ์อื่น',
  other: 'วิธีอื่น',
};

/** Ordered for the filter; the enum itself carries no order. */
export const EVALUATION_METHOD_ORDER: EvaluationMethod[] = [
  'lowest_price',
  'price_performance',
  'other',
];

/** What each method means for a bidder, in one line, for the filter and the detail page. */
export const EVALUATION_METHOD_HINTS: Record<EvaluationMethod, string> = {
  lowest_price: 'ตัดสินจากราคาอย่างเดียว',
  price_performance: 'ตัดสินจากราคาร่วมกับเกณฑ์อื่น เช่น เทคนิคหรือประสบการณ์',
  other: 'เอกสารระบุวิธีอื่น',
};

/** Which document the evaluation was read from. */
export const EVALUATION_DOCUMENT_LABELS: Record<EvaluationDocument, string> = {
  invitation: 'ประกาศเชิญชวน',
  tor: 'TOR',
  bidding_document: 'เอกสารประกวดราคา',
};
