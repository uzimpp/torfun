import {
  fullName,
  type CreateTorReport,
  type ReviewTorReport,
  type TorReportFilter,
} from '@torfun/types';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../core/errors';
import type { TorReportStore } from '../repositories/tor-report.repository';
import type { UserStore } from '../repositories/user.repository';
import type { TorService } from './tor.service';
import { audienceOf } from './audience';

export class TorReportService {
  constructor(
    private readonly reports: TorReportStore,
    private readonly tors: Pick<TorService, 'get'>,
    private readonly users: Pick<UserStore, 'findById'>,
  ) {}

  async submit(projectId: string, reporterId: string, input: CreateTorReport) {
    const reporter = await this.users.findById(reporterId);
    if (!reporter?.isActive) throw new UnauthorizedError();
    const tor = await this.tors.get(projectId, audienceOf(reporter.role));
    if (tor.publicationRemoval) throw new ConflictError('TOR นี้ถูกนำออกจากการเผยแพร่แล้ว');
    const report = await this.reports.create({
      projectId: tor.projectId,
      projectName: tor.projectName,
      deptName: tor.deptName,
      reporter: {
        id: reporter.id,
        username: reporter.username,
        fullName: fullName(reporter),
        email: reporter.email ?? null,
      },
      reason: input.reason,
      details: input.details?.trim() || null,
      createdAt: new Date().toISOString(),
    });
    if (!report) throw new ConflictError('คุณได้รายงาน TOR นี้แล้ว และกำลังรอผู้ดูแลตรวจสอบ');
    return report;
  }

  private async reviewer(userId: string) {
    const user = await this.users.findById(userId);
    if (!user?.isActive) throw new UnauthorizedError();
    if (user.role !== 'admin') throw new ForbiddenError('Admin access required');
    return {
      id: user.id,
      username: user.username,
      fullName: fullName(user),
      email: user.email ?? null,
    };
  }

  async list(userId: string, limit: number, offset: number, status: TorReportFilter) {
    await this.reviewer(userId);
    return this.reports.list(limit, offset, status);
  }

  async review(userId: string, reportId: string, input: ReviewTorReport) {
    const reviewer = await this.reviewer(userId);
    const result = await this.reports.review(reportId, input, {
      reviewer,
      reviewedAt: new Date().toISOString(),
      note: input.note?.trim() || null,
    });
    switch (result.kind) {
      case 'not_found':
        throw new NotFoundError('ไม่พบรายงานนี้');
      case 'project_missing':
        throw new NotFoundError('ไม่พบ TOR ต้นฉบับ กรุณารีเฟรชรายการ');
      case 'already_reviewed':
        throw new ConflictError('รายงานนี้ได้รับการตรวจสอบแล้ว กรุณารีเฟรชรายการ');
      case 'already_removed':
        throw new ConflictError('TOR นี้ถูกนำออกแล้ว คุณยังสามารถปิดรายงานนี้ได้');
      case 'reviewed':
        return result.report;
    }
  }
}
