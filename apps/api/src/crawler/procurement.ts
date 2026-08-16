export interface ProcurementRecord {
  project_name: string;
  organization: string;
  procurement_method: string;
  quantity: string;
  winner: string;
  price: string;
  announcement_date: string;
}

export function extractProcurement(text: string): ProcurementRecord {
  const clean_text = text
    .replace(/\u00a0/g, ' ')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const organization_match = clean_text.match(/ประกาศ(.*?)เรื่อง/);

  const project_match = clean_text.match(/เรื่อง ประกาศผู้ชนะการเสนอราคา (.*?) โดยวิธี/);

  const method_match = clean_text.match(/โดยวิธี([^\s]+)/);

  const quantity_match = clean_text.match(/จำนวน\s+([0-9๐-๙,]+)\s*([^\s]+)/);

  const winner_match = clean_text.match(/ผู้ได้รับการคัดเลือก ได้แก่\s*(.*?)โดยเสนอราคา/);

  const price_match = clean_text.match(/เป็นเงินทั้งสิ้น\s*([0-9๐-๙,]+\.[0-9๐-๙]{2})\s*บาท/);

  const date_match = clean_text.match(
    /ประกาศ ณ วันที่\s*([0-9๐-๙]{1,2}\s+[ก-๙]+\s+พ\.ศ\.\s*[0-9๐-๙]{4})/,
  );

  return {
    project_name: project_match?.[1]?.trim() ?? '',
    organization: organization_match?.[1]?.trim() ?? '',
    procurement_method: method_match?.[1]?.trim() ?? '',
    quantity: quantity_match?.[0]?.trim() ?? '',
    winner: winner_match?.[1]?.trim() ?? '',
    price: price_match?.[1]?.trim() ?? '',
    announcement_date: date_match?.[1]?.trim() ?? '',
  };
}
