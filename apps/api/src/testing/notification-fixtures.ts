import { EMPTY_TIMELINE, type Procurement } from '@torfun/types';
import { OFFICER_VISIBLE_OUTCOME } from '../services/audience';
/** Test-only evidence. Use exclusively in disposable *_test databases. */
export function notificationTor(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '69100000001',
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรมทดสอบ',
    deptSubName: null,
    deptCode: '0000',
    announceDate: '2026-10-26',
    purchaseMethodName: 'e-bidding',
    discoveredAt: '2026-10-26T00:00:00.000Z',
    budgetYear: 2569,
    typeId: null,
    goodsId: null,
    projectMoney: 1000000,
    priceBuild: null,
    detailReadAt: null,
    timeline: { ...EMPTY_TIMELINE, status: 'open' },
    state: 'Completed',
    outcome: OFFICER_VISIBLE_OUTCOME,
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    approved: null,
    archive: {
      zipId: 'test-archive',
      documents: [
        {
          member: 'tor.pdf',
          filename: 'tor.pdf',
          bytes: 1000,
          namePattern: 'canonical',
          role: 'main_tor',
          note: 'Test-only TOR',
        },
      ],
      torAmbiguous: false,
    },
    analysis: {
      summary: 'Test-only analysis',
      scopeOfWork: ['พัฒนาเว็บ'],
      budgetThb: 1000000,
      deadlineAt: '2030-12-31',
      durationDays: 90,
      techStack: ['TypeScript', 'React'],
      targetPlatforms: ['web_app'],
      requiredQualifications: ['ตรวจสอบเอกสารจริง'],
    },
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
