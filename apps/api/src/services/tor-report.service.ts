import { fullName, type CreateTorReport, type UserRole } from '@torfun/types';
import { ConflictError, UnauthorizedError } from '../core/errors';
import type { TorReportStore } from '../repositories/tor-report.repository';
import type { UserStore } from '../repositories/user.repository';
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
    const tor = await this.tors.get(projectId, role === 'admin');
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

  list(limit: number, offset: number) {
    return this.reports.list(limit, offset);
  }
}
