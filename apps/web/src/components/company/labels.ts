import type { ClientKind, DurationUnit, TargetPlatform } from '@torfun/types';

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
