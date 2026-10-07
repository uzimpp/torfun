export type RequirementStatus = 'matched' | 'unmatched' | 'unknown';

export type TorRequirementGroup = {
  category: string;
  items: { label: string; status: RequirementStatus }[];
};

export type TorReviewMock = {
  projectId: string;
  title: string;
  agency: string;
  location: string;
  budget: number;
  status: 'เปิดรับข้อเสนอ' | 'ปิดรับข้อเสนอ' | 'อยู่ระหว่างพิจารณา';
  technologies: string[];
  summary: string;
  objectives: string[];
  scope: string[];
  bidderQualifications: string[];
  keyRequirements: { label: string; detail: string }[];
  matchScore: number;
  matchingCategories: TorRequirementGroup[];
  announcementDate: string;
  submissionDeadline: string;
};

const baseTorReviewMockData: TorReviewMock = {
  projectId: 'mock-project-001',
  title: 'โครงการพัฒนาระบบจัดเก็บและวิเคราะห์ข้อมูลสถิติภาครัฐ',
  agency: 'สำนักงานสถิติแห่งชาติ',
  location: 'กรุงเทพมหานคร',
  budget: 4_500_000,
  status: 'เปิดรับข้อเสนอ',
  technologies: ['Python', 'Node.js', 'Distributed SQL', 'NoSQL'],
  summary:
    'พัฒนาระบบ Big Data Platform สำหรับรวบรวม จัดเก็บ และวิเคราะห์ข้อมูลสถิติจากหน่วยงานภาครัฐ เพื่อสนับสนุนการตัดสินใจเชิงนโยบายอย่างเป็นระบบ',
  objectives: [
    'จัดทำศูนย์กลางข้อมูลสถิติภาครัฐที่เชื่อมโยงข้อมูลจากหน่วยงานที่เกี่ยวข้อง',
    'เพิ่มประสิทธิภาพการวิเคราะห์และนำเสนอข้อมูลสำหรับผู้บริหาร',
    'ยกระดับการเข้าถึงข้อมูลให้สะดวก ปลอดภัย และตรวจสอบย้อนกลับได้',
  ],
  scope: [
    'วิเคราะห์และออกแบบสถาปัตยกรรมระบบจัดเก็บข้อมูลขนาดใหญ่',
    'พัฒนา Data Ingestion และ Data Transformation สำหรับข้อมูลจาก 20 หน่วยงาน',
    'พัฒนาแดชบอร์ดและรายงานแบบโต้ตอบสำหรับผู้ใช้งานหลายระดับ',
    'ทดสอบระบบ จัดทำคู่มือ และถ่ายทอดความรู้ให้เจ้าหน้าที่ของหน่วยงาน',
  ],
  bidderQualifications: [
    'เป็นนิติบุคคลที่จดทะเบียนถูกต้องตามกฎหมาย',
    'มีผลงานพัฒนาระบบสารสนเทศหรือระบบข้อมูลขนาดใหญ่ในช่วง 5 ปีที่ผ่านมา',
    'มีบุคลากรด้านการวิเคราะห์ข้อมูลและการพัฒนาซอฟต์แวร์ตามจำนวนที่กำหนด',
    'ไม่เป็นผู้ทิ้งงานของหน่วยงานของรัฐ',
  ],
  keyRequirements: [
    { label: 'Backend Framework', detail: 'Python / Node.js หรือเทียบเท่า' },
    { label: 'Database', detail: 'Distributed SQL / NoSQL รองรับข้อมูลระดับ Terabytes' },
    { label: 'ความปลอดภัย', detail: 'ต้องมี ISO/IEC 27001 หรือ CMMI Level 3 ขึ้นไป' },
  ],
  matchScore: 94,
  matchingCategories: [
    {
      category: 'เทคโนโลยี',
      items: [
        { label: 'Python / Node.js', status: 'matched' },
        { label: 'Distributed SQL / NoSQL', status: 'matched' },
        { label: 'ISO/IEC 27001', status: 'unmatched' },
      ],
    },
    {
      category: 'ประสบการณ์',
      items: [
        { label: 'พัฒนาระบบ Big Data', status: 'matched' },
        { label: 'ระบบรองรับผู้ใช้งานจำนวนมาก', status: 'matched' },
        { label: 'ประสบการณ์โครงการภาครัฐ', status: 'unmatched' },
      ],
    },
    {
      category: 'คุณสมบัติผู้เสนอราคา',
      items: [
        { label: 'จดทะเบียนบริษัท', status: 'matched' },
        { label: 'ทุนจดทะเบียนตามที่กำหนด', status: 'matched' },
        { label: 'มีใบรับรอง ISO/IEC 27001', status: 'unknown' },
      ],
    },
  ],
  announcementDate: '1 ตุลาคม 2569',
  submissionDeadline: '30 ตุลาคม 2569',
};

export function getTorReviewMock(projectId: string): TorReviewMock {
  return { ...baseTorReviewMockData, projectId };
}
