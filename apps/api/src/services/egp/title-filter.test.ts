import { describe, expect, test } from 'bun:test';
import { titleExclusion } from './title-filter';

const dropped: Array<[string, string]> = [
  [
    'a lift contract',
    'เหมาบริการบำรุงรักษา ซ่อมแซมลิฟท์ (แบบรวมอะไหล่) จำนวน 36 เครื่อง ของโรงพยาบาลสิรินธร',
  ],
  ['road markings', 'ทำเครื่องหมายจราจรบนขอบทาง พื้นที่ธนบุรี'],
  ['a hanging traffic sign', 'บำรุงรักษาและทำความสะอาดป้ายชนิดแขวนเหนือผิวจราจร พื้นที่พระนครใต้'],
  ['laundry', 'เหมาบริการบริหารการจัดการผ้าแบบครบวงจร ประจำปีงบประมาณ พ.ศ. ๒๕๗๐'],
  ['air-conditioning repair', 'บริการบำรุงรักษาและซ่อมแซมแก้ไขระบบปรับอากาศ จำนวน 5 รายการ'],
  [
    'building engineering systems',
    'เหมาและซ่อมบำรุงรักษาระบบวิศวกรรม สำนักงานศุลกากรท่าเรือแหลมฉบัง',
  ],
  ['a boat', 'ซ่อมแซมเรือศุลกากร 806'],
  ['uniform tailoring', 'เหมาตัดเย็บเครื่องแบบลูกจ้างตำแหน่งต่าง ๆ จำนวน 962 ชุด'],
  ['construction', 'ก่อสร้างรางระบายน้ำ ค.ส.ล. พื้นที่เขตบางเขน'],
  ['electric cable as goods', 'สายไฟฟ้าของเครื่องสูบน้ำไฟฟ้า จำนวน 7 รายการ'],
];

const kept: Array<[string, string]> = [
  [
    'an information system',
    'จ้างบำรุงรักษาระบบสารสนเทศเพื่อพัฒนาระบบสำนักงานภายใน สำนักป้องกันและบรรเทาสาธารณภัย',
  ],
  ['a GIS and MIS', 'จ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์ (GIS) และระบบสารสนเทศการบริหาร (MIS)'],
  [
    'AI software',
    'จ้างบริการซอฟต์แวร์ปัญญาประดิษฐ์เพื่อเพิ่มประสิทธิภาพการทำงานในองค์กร ครั้งที่ 2',
  ],
  ['a network MA', 'จ้างบำรุงรักษา (MA) Hardware อุปกรณ์ DG-Link และอุปกรณ์เครือข่ายคอมพิวเตอร์'],
  ['a contact centre', 'จ้างดำเนินงานศูนย์บริการลูกค้า (DGA Contact Center)'],
  [
    'an MRI service (a doubtful one, left to the model)',
    'เหมาบริการตรวจวินิจฉัยผู้ป่วยด้วยเครื่องตรวจอวัยวะภายในด้วยคลื่นสนามแม่เหล็กไฟฟ้า (MRI)',
  ],
  ['SMS', 'บริการส่งข้อความสั้น (SMS)'],
  ['a project with no recognised word', 'พัฒนาระบบรวบรวมกิจกรรมการประมวลผลข้อมูลส่วนบุคคล'],
];

describe('titleExclusion', () => {
  for (const [name, title] of dropped) {
    test(`drops ${name}`, () => {
      expect(titleExclusion(title)).not.toBeNull();
    });
  }

  for (const [name, title] of kept) {
    test(`lets ${name} through`, () => {
      expect(titleExclusion(title)).toBeNull();
    });
  }

  test('reports the term that decided', () => {
    expect(titleExclusion('ทำเครื่องหมายจราจรบนขอบทาง')).toBe('จราจร');
  });

  describe('a utility named as buyer or place is not utility work', () => {
    test('การไฟฟ้า as buyer of software', () => {
      expect(
        titleExclusion(
          'จ้างพัฒนาระบบบริหารงานบุคคล การไฟฟ้าส่วนภูมิภาค เขต 1',
          'การไฟฟ้าส่วนภูมิภาค',
        ),
      ).toBeNull();
    });

    test('การไฟฟ้า as a landmark in construction is dropped by construction, not by the name', () => {
      expect(titleExclusion('ขุดลอกคลองข้างการไฟฟ้า จากคลองบางสี่บาท')).toBeNull();
      expect(titleExclusion('ก่อสร้างขุดลอกลำรางข้างการไฟฟ้า')).toBe('ก่อสร้าง');
    });

    test('การประปา and คลองประปา alone never decide', () => {
      expect(titleExclusion('จ้างที่ปรึกษาการประปาส่วนภูมิภาค')).toBeNull();
      expect(titleExclusion('จัดทำแผนที่ริมคลองประปา')).toBeNull();
    });

    test('the buyer is masked even when it is the only reason a term would match', () => {
      expect(titleExclusion('จ้างบริการ ระบบไฟฟ้า การไฟฟ้านครหลวง')).toBe('งานไฟฟ้า');
      expect(titleExclusion('จ้างบริการ การไฟฟ้านครหลวง')).toBeNull();
    });
  });

  test('a bare ไฟฟ้า or ประปา is never enough', () => {
    expect(titleExclusion('โครงการไฟฟ้า')).toBeNull();
    expect(titleExclusion('โครงการประปา')).toBeNull();
  });

  test('a software word wins over a deny term', () => {
    expect(titleExclusion('จ้างพัฒนาระบบสารสนเทศงานก่อสร้าง')).toBeNull();
    expect(titleExclusion('ซอฟต์แวร์บริหารลิฟต์')).toBeNull();
  });

  test('เรือนจำ is a building, not a boat', () => {
    expect(titleExclusion('จ้างพัฒนาระบบบริหารงาน เรือนจำกลางคลองเปรม')).toBeNull();
  });

  test('the agency named in the title is masked', () => {
    expect(titleExclusion('จ้างบริการสำนักงานก่อสร้าง', 'สำนักงานก่อสร้าง')).toBeNull();
  });
});
