import { search_procurement } from './data-go-th';

const software_keywords = [
  'ERP',
  'CRM',
  'MIS',
  'ระบบสารสนเทศ',
  'ระบบคอมพิวเตอร์',
  'พัฒนาระบบ',
  'ซอฟต์แวร์',
  'โปรแกรม',
  'เว็บไซต์',
  'Cloud',
  'AI',
];

const projects = new Map();

for (const keyword of software_keywords) {
  console.log(`Searching: ${keyword}`);

  const records = await search_procurement(keyword, 10);

  for (const record of records) {
    const project_id = record['รหัสโครงการ'];

    projects.set(project_id, {
      project_id,
      project_name: record['ชื่อโครงการ'],
      organization: record['ชื่อหน่วยงาน'],
      budget: record['งบประมาณ(บาท)'],
      province: record['จังหวัด'],
    });
  }
}

console.log('');
console.log(`Total unique projects: ${projects.size}`);
console.log('');

for (const project of projects.values()) {
  console.log(project);
}
