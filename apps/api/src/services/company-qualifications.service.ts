import type { CompanyQualificationsRecord } from '@torfun/types';
import { ConflictError, NotFoundError } from '../core/errors';
import type { CompanyStore } from '../repositories/company.repository';
import type { ExperienceStore } from '../repositories/experience.repository';
import type { UserStore } from '../repositories/user.repository';
import { optionalCompanyId, requireCompanyId } from './company-scope';

export class CompanyQualificationsService {
  constructor(
    private readonly companies: CompanyStore,
    private readonly experiences: ExperienceStore,
    private readonly users: UserStore,
  ) {}

  async get(userId: string): Promise<CompanyQualificationsRecord | null> {
    const companyId = await optionalCompanyId(this.users, userId);
    return companyId ? this.companies.findQualifications(companyId) : null;
  }

  async replace(userId: string, input: CompanyQualificationsRecord) {
    const companyId = await requireCompanyId(this.users, userId);
    if (input.companyId !== companyId) throw new NotFoundError('No such company profile');
    const updated = await this.companies.replaceQualifications(companyId, input.revision, input);
    if (!updated)
      throw new ConflictError('ข้อมูลบริษัทมีการเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
    return updated;
  }

  async matchingInputs(userId: string) {
    const profile = await this.get(userId);
    if (!profile) return null;
    const experiences = await this.experiences.listByCompany(profile.companyId);
    return { profile, experiences };
  }
}
