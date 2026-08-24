import { search_procurement } from './data-go-th';

const records = await search_procurement('ERP', 5);

console.log('Found:', records.length);

for (const record of records) {
  console.log({
    project_id: record['รหัสโครงการ'],
    project_name: record['ชื่อโครงการ'],
    organization: record['ชื่อหน่วยงาน'],
    budget: record['งบประมาณ(บาท)'],
    province: record['จังหวัด'],
  });
}
