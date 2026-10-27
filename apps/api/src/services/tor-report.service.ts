import {
  fullName,
  type CreateTorReport,
  type ReviewTorReport,
  type TorReportFilter,
  type UserRole,
} from '@torfun/types';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../core/errors';
import type { TorReportStore } from '../repositories/tor-report.repository';
import type { UserStore } from '../repositories/user.repository';
import { audienceOf } from './audience';
import type { TorService } from './tor.service';

export class TorReportService {
  constructor(
    private readonly reports: TorReportStore,
    private readonly tors: Pick<TorService, 'get'>,
    private readonly users: Pick<UserStore, 'findById'>,
  ) {}

  async submit(projectId: string, reporterId: string, role: UserRole, input: CreateTorReport) {
    const reporter = await this.users.findById(reporterId);
    if (!reporter?.isActive) throw new UnauthorizedError();
    const tor = await this.tors.get(projectId, audienceOf(role));
    if (tor.unpublished) throw new ConflictError('TOR นี้ถูกนำออกจากการเผยแพร่แล้ว');
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
      status: 'pending',
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
    if (result.kind === 'not_found') throw new NotFoundError('ไม่พบรายงานนี้');
    if (result.kind === 'project_missing')
      throw new NotFoundError('ไม่พบ TOR ต้นฉบับ กรุณารีเฟรชรายการ');
    if (result.kind === 'already_reviewed')
      throw new ConflictError('รายงานนี้ได้รับการตรวจสอบแล้ว กรุณารีเฟรชรายการ');
    if (result.kind === 'reviewed') return result.report;
    throw new Error('Unexpected review result');
  }
}
