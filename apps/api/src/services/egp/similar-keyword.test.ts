import { describe, expect, test } from 'bun:test';
import {
  buildSimilarKeyword,
  KEYWORD_MIN_GENERATED_LENGTH,
  KEYWORD_MIN_SEARCH_LENGTH,
} from './similar-keyword';

const METHOD = 'ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)';
const BMA = 'กรุงเทพมหานคร';

const keywordOf = (name: string, dept?: string | null) => buildSimilarKeyword(name, dept).keyword;
const generatedOf = (name: string, dept?: string | null) =>
  buildSimilarKeyword(name, dept).generated;

describe('buildSimilarKeyword: the five projects the rules were first tried on', () => {
  // Public titles of the stored projects, as the API published them. The expected text is
  // the keyword that was used against the open-data API; two of the five returned no row,
  // which is part of what was observed.
  const cases: { label: string; name: string; dept: string; expected: string }[] = [
    {
      label: 'a new development project (nothing found for it)',
      name: `ประกวดราคาจ้างจ้างเหมาพัฒนาระบบสารสนเทศลงทะเบียนยานพาหนะบัญชีสีเขียว (Green List) ${METHOD}`,
      dept: BMA,
      expected: 'พัฒนาระบบสารสนเทศลงทะเบียนยานพาหนะบัญชีสีเขียว (Green List)',
    },
    {
      label: 'a recurring maintenance contract',
      name: `ประกวดราคาจ้างบำรุงรักษาระบบเทคโนโลยีสารสนเทศเพื่อพัฒนาระบบสำนักงานภายในสำนักป้องกันและบรรเทาสาธารณภัย ${METHOD}`,
      dept: BMA,
      expected:
        'บำรุงรักษาระบบเทคโนโลยีสารสนเทศเพื่อพัฒนาระบบสำนักงานภายในสำนักป้องกันและบรรเทาสาธารณภัย',
    },
    {
      label: 'a name that repeats the agency, a location and a quantity (nothing found for it)',
      name: `ประกวดราคาจ้างโครงการพัฒนาระบบรวบรวมกิจกรรมการประมวลผลข้อมูลส่วนบุคคล กรมศุลกากร แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 1 โครงการ ${METHOD}`,
      dept: 'กรมศุลกากร',
      expected: 'พัฒนาระบบรวบรวมกิจกรรมการประมวลผลข้อมูลส่วนบุคคล',
    },
    {
      label: 'a recurring GIS and MIS maintenance contract',
      name: `ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์ (GIS) และระบบสารสนเทศการบริหาร (MIS) เพื่อการป้องกันและบรรเทาสาธารณภัย ${METHOD}`,
      dept: BMA,
      expected:
        'บำรุงรักษาระบบสารสนเทศภูมิศาสตร์ (GIS) และระบบสารสนเทศการบริหาร (MIS) เพื่อการป้องกันและบรรเทาสาธารณภัย',
    },
    {
      label: 'a recurring system maintenance contract',
      name: `ประกวดราคาจ้างบำรุงรักษาระบบโครงการพัฒนาระบบสารสนเทศและติดตั้งระบบกล้อง DVR แก่รถดับเพลิงและกู้ภัย ${METHOD}`,
      dept: BMA,
      expected:
        'บำรุงรักษาระบบโครงการพัฒนาระบบสารสนเทศและติดตั้งระบบกล้อง DVR แก่รถดับเพลิงและกู้ภัย',
    },
  ];

  test.each(cases)('$label gives the keyword that was tried', ({ name, dept, expected }) => {
    const result = buildSimilarKeyword(name, dept);

    expect(result.keyword).toBe(expected);
    expect(result.generated).toBe(expected);
    expect(result.skipped).toBeNull();
  });

  test.each(cases)('$label: the keyword is a piece of the stored name itself', ({ name, dept }) => {
    expect(name.includes(buildSimilarKeyword(name, dept).keyword!)).toBe(true);
  });
});

describe('buildSimilarKeyword: why the verb prefix is cut', () => {
  test('a keyword without the verb still matches an earlier year whose title added "ค่า"', () => {
    const keyword = keywordOf(
      `ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์ประจำปี ${METHOD}`,
      BMA,
    )!;

    // Open data matches a keyword inside a name, so the earlier title still contains it.
    expect(`ประกวดราคาจ้างค่า${keyword} ${METHOD}`.includes(keyword)).toBe(true);
    // The stored name in full would not have matched it.
    expect(
      `ประกวดราคาจ้างค่าบำรุงรักษาระบบสารสนเทศภูมิศาสตร์ประจำปี ${METHOD}`.includes(
        `ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์ประจำปี ${METHOD}`,
      ),
    ).toBe(false);
  });
});

describe('buildSimilarKeyword: R1, the method tail and a re-run mark', () => {
  test('cuts the method tail and everything after it', () => {
    expect(
      generatedOf(
        'ประกวดราคาจ้างพัฒนาระบบบริหารจัดการข้อมูลกลาง ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding) เพิ่มเติม',
      ),
    ).toBe('พัฒนาระบบบริหารจัดการข้อมูลกลาง');
  });

  test.each(['(ครั้งที่ 2)', '(ครั้งที่ ๒)', '(ครั้งที่2)', '(ครั้งที่ 12)'])(
    'cuts a re-run mark %p',
    (mark) => {
      expect(generatedOf(`ประกวดราคาจ้างพัฒนาระบบบริหารจัดการข้อมูลกลาง ${mark} ${METHOD}`)).toBe(
        'พัฒนาระบบบริหารจัดการข้อมูลกลาง',
      );
    },
  );

  test('a name without the method tail is not damaged', () => {
    expect(generatedOf('พัฒนาระบบบริหารจัดการข้อมูลกลางของหน่วยงาน')).toBe(
      'พัฒนาระบบบริหารจัดการข้อมูลกลางของหน่วยงาน',
    );
  });
});

describe('buildSimilarKeyword: R2, the procedure word and the verbs', () => {
  const core = 'พัฒนาระบบบริหารจัดการข้อมูลกลาง';

  test.each(['จ้างจ้างเหมา', 'จ้างเหมา', 'จ้าง', 'ซื้อจัดซื้อ', 'จัดซื้อ', 'ซื้อ', 'จัดจ้าง'])(
    'cuts the verb %p after "ประกวดราคา"',
    (verb) => {
      expect(generatedOf(`ประกวดราคา${verb}${core} ${METHOD}`)).toBe(core);
    },
  );

  test('cuts a verb with no procedure word before it', () => {
    expect(generatedOf(`จ้างเหมา${core}`)).toBe(core);
  });

  test('cuts verbs that are stacked', () => {
    expect(generatedOf(`ประกวดราคาจ้างจ้างเหมา${core}`)).toBe(core);
    expect(generatedOf(`ประกวดราคาซื้อจัดซื้อ${core}`)).toBe(core);
  });

  test('leaves a verb that is in the middle of the name', () => {
    expect(generatedOf(`ประกวดราคาจ้างพัฒนาระบบและจ้างเหมาบำรุงรักษาข้อมูล ${METHOD}`)).toBe(
      'พัฒนาระบบและจ้างเหมาบำรุงรักษาข้อมูล',
    );
  });

  test('KNOWN WEAKNESS: a verb the rules do not list ("จัดหา") is left in', () => {
    expect(generatedOf(`ประกวดราคาซื้อจัดหาระบบตรวจสอบข้อมูลอัตโนมัติ ${METHOD}`)).toBe(
      'จัดหาระบบตรวจสอบข้อมูลอัตโนมัติ',
    );
  });
});

describe('buildSimilarKeyword: R3, filler after the verb', () => {
  const core = 'พัฒนาระบบบริหารจัดการข้อมูลกลาง';

  test.each(['ค่า', 'ค่าใช้จ่ายในการ', 'โครงการ', 'ค่าโครงการ'])('cuts the filler %p', (filler) => {
    expect(generatedOf(`ประกวดราคาจ้าง${filler}${core} ${METHOD}`)).toBe(core);
  });

  test('leaves "ค่า" that is part of a later word', () => {
    expect(generatedOf(`ประกวดราคาจ้างพัฒนาระบบคำนวณค่าธรรมเนียมกลาง ${METHOD}`)).toBe(
      'พัฒนาระบบคำนวณค่าธรรมเนียมกลาง',
    );
  });
});

describe('buildSimilarKeyword: R4, the agency and the location', () => {
  const core = 'พัฒนาระบบบริหารจัดการข้อมูลกลาง';

  test('cuts from the agency name where the name repeats it', () => {
    expect(
      generatedOf(`ประกวดราคาจ้าง${core} กรมตัวอย่าง ใช้งานภายใน ${METHOD}`, 'กรมตัวอย่าง'),
    ).toBe(core);
  });

  test('ignores the agency when the name does not repeat it, or none is given', () => {
    expect(generatedOf(`ประกวดราคาจ้าง${core} ${METHOD}`, 'กรมตัวอย่าง')).toBe(core);
    expect(generatedOf(`ประกวดราคาจ้าง${core} ${METHOD}`, null)).toBe(core);
    expect(generatedOf(`ประกวดราคาจ้าง${core} ${METHOD}`, undefined)).toBe(core);
    expect(generatedOf(`ประกวดราคาจ้าง${core} ${METHOD}`, '   ')).toBe(core);
  });

  test.each(['แขวงตัวอย่าง', 'ตำบลตัวอย่าง', 'เขตตัวอย่าง', 'อำเภอตัวอย่าง'])(
    'cuts from a location word %p even with no agency',
    (place) => {
      expect(generatedOf(`ประกวดราคาจ้าง${core} ${place} จังหวัดตัวอย่าง ${METHOD}`)).toBe(core);
    },
  );

  test('a location word glued to the text (no space before it) is not a cut', () => {
    expect(generatedOf(`ประกวดราคาจ้างพัฒนาระบบเขตข้อมูลกลางของหน่วยงาน ${METHOD}`)).toBe(
      'พัฒนาระบบเขตข้อมูลกลางของหน่วยงาน',
    );
  });
});

describe('buildSimilarKeyword: R5, a quantity at the end', () => {
  const core = 'พัฒนาระบบบริหารจัดการข้อมูลกลาง';

  test.each([
    ' 1 โครงการ',
    ' จำนวน 3 รายการ',
    ' จำนวน ๓ ตู้',
    ' ๑๒ แห่ง',
    ' 1,000 ชุด',
    ' 2 คัน',
    ' 5 เครื่อง',
    ' 4 หลัง',
  ])('cuts the quantity %p', (tail) => {
    expect(generatedOf(`ประกวดราคาจ้าง${core}${tail} ${METHOD}`)).toBe(core);
  });

  test('cuts two quantities at the end', () => {
    expect(generatedOf(`ประกวดราคาจ้าง${core} 2 รายการ 1 โครงการ ${METHOD}`)).toBe(core);
  });

  test('KNOWN WEAKNESS: a quantity in the middle of the name is left in', () => {
    expect(
      generatedOf(
        `ประกวดราคาซื้อโต๊ะเก้าอี้สแตนเลสสำหรับโรงอาหาร จำนวน 85 ชุด ของโรงเรียนในสังกัด ${METHOD}`,
      ),
    ).toBe('โต๊ะเก้าอี้สแตนเลสสำหรับโรงอาหาร จำนวน 85 ชุด ของโรงเรียนในสังกัด');
  });

  test('a number that is not followed by a unit is left alone', () => {
    expect(generatedOf(`ประกวดราคาจ้างปรับปรุงระบบสารสนเทศกลางรุ่น 38 ${METHOD}`)).toBe(
      'ปรับปรุงระบบสารสนเทศกลางรุ่น 38',
    );
  });
});

describe('buildSimilarKeyword: R6 and the search guard', () => {
  test('under 8 characters is no keyword', () => {
    const result = buildSimilarKeyword(`ประกวดราคาซื้อรถยนต์ ${METHOD}`);

    expect(result.generated.length).toBeLessThan(KEYWORD_MIN_GENERATED_LENGTH);
    expect(result).toEqual({ generated: 'รถยนต์', keyword: null, skipped: 'too_short' });
  });

  test('from 8 to 19 characters is kept as generated but is not searched', () => {
    const result = buildSimilarKeyword(`ประกวดราคาซื้อครุภัณฑ์คอมพิวเตอร์ ${METHOD}`);

    expect(result.generated).toBe('ครุภัณฑ์คอมพิวเตอร์');
    expect(result.generated.length).toBeGreaterThanOrEqual(KEYWORD_MIN_GENERATED_LENGTH);
    expect(result.generated.length).toBeLessThan(KEYWORD_MIN_SEARCH_LENGTH);
    expect(result).toEqual({
      generated: 'ครุภัณฑ์คอมพิวเตอร์',
      keyword: null,
      skipped: 'too_generic',
    });
  });

  test('exactly the search minimum is searched, and one less is not', () => {
    const twenty = 'ก'.repeat(KEYWORD_MIN_SEARCH_LENGTH);
    const nineteen = 'ก'.repeat(KEYWORD_MIN_SEARCH_LENGTH - 1);

    expect(buildSimilarKeyword(twenty)).toEqual({
      generated: twenty,
      keyword: twenty,
      skipped: null,
    });
    expect(buildSimilarKeyword(nineteen)).toEqual({
      generated: nineteen,
      keyword: null,
      skipped: 'too_generic',
    });
  });

  test('an empty name, or one that is nothing but cut text, gives no keyword', () => {
    expect(buildSimilarKeyword('')).toEqual({ generated: '', keyword: null, skipped: 'too_short' });
    expect(keywordOf(`ประกวดราคาจ้าง ${METHOD}`)).toBeNull();
  });

  test('the thresholds are the ones the ADR names', () => {
    expect(KEYWORD_MIN_GENERATED_LENGTH).toBe(8);
    expect(KEYWORD_MIN_SEARCH_LENGTH).toBe(20);
  });
});

describe('buildSimilarKeyword: general behaviour', () => {
  test('surrounding whitespace is trimmed', () => {
    expect(generatedOf(`  ประกวดราคาจ้างพัฒนาระบบบริหารจัดการข้อมูลกลาง   ${METHOD}  `)).toBe(
      'พัฒนาระบบบริหารจัดการข้อมูลกลาง',
    );
  });

  test('the same name always gives the same keyword', () => {
    const name = `ประกวดราคาจ้างพัฒนาระบบบริหารจัดการข้อมูลกลาง ${METHOD}`;

    expect(buildSimilarKeyword(name, BMA)).toEqual(buildSimilarKeyword(name, BMA));
  });

  test('English text, brackets and digits inside the name are kept as written', () => {
    expect(generatedOf(`ประกวดราคาจ้างพัฒนาระบบ Smart City (Phase 2) ของเมือง ${METHOD}`)).toBe(
      'พัฒนาระบบ Smart City (Phase 2) ของเมือง',
    );
  });

  test('nothing is classified: a non-software name gets a keyword by the same rules', () => {
    // A title is not a verdict (AGENTS.md): the builder never asks what the work is.
    expect(
      keywordOf(`ประกวดราคาจ้างก่อสร้างปรับปรุงอาคารสำนักงานเขตตัวอย่างหลังใหม่ ${METHOD}`),
    ).toBe('ก่อสร้างปรับปรุงอาคารสำนักงานเขตตัวอย่างหลังใหม่');
  });
});
