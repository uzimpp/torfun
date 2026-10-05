const values = [
  {
    title: 'คัดกรองประกาศที่เกี่ยวข้อง',
    description:
      'มุ่งเน้นงานซอฟต์แวร์แบบ e-bidding ของหน่วยงานภาครัฐ เพื่อช่วยจัดลำดับประกาศที่ควรนำมาอ่านต่อ',
    note: 'จัดลำดับจากชื่อโครงการและวิธีจัดซื้อ',
  },
  {
    title: 'ทำความเข้าใจข้อกำหนด TOR',
    description:
      'ระบบใช้ AI ช่วยสรุปความต้องการจากเอกสาร เพื่อให้ทีมกลับไปตรวจสอบรายละเอียดได้ตรงประเด็น',
    note: 'เอกสารต้นฉบับยังเข้าถึงได้เสมอ',
  },
  {
    title: 'พิจารณาความเหมาะสมกับทีม',
    description:
      'การเทียบข้อกำหนดกับประสบการณ์ของบริษัทเป็นเป้าหมายของระบบ เพื่อช่วยประกอบการประเมินโอกาสก่อนตัดสินใจ',
    note: 'อ้างอิงผลงานที่ทีมบันทึกไว้',
  },
];

/**
 * What the product is for, in three claims.
 *
 * Laid out as a sticky heading beside a divided list rather than as a row of
 * equal cards: the three are read in order and none of them is a separate
 * offering, so boxing them would suggest a choice that is not there.
 */
export function ValueSection() {
  return (
    <section aria-labelledby="value-heading" id="value" className="scroll-mt-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:px-10 lg:py-28">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p data-rise="0" className="text-primary text-xs font-medium tracking-wider uppercase">
            สิ่งที่ระบบช่วย
          </p>
          <h2
            id="value-heading"
            data-rise="1"
            className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            ลดเวลาค้นหา
            <br />
            เพิ่มเวลาให้การพิจารณา
          </h2>
          <p data-rise="2" className="text-muted-foreground mt-5 max-w-sm">
            งานส่วนใหญ่ของการหาโครงการคือการคัดทิ้ง Torfun รับงานส่วนนั้นไป
            เพื่อให้คนอ่านสิบประกาศที่สำคัญ แทนสี่ร้อยประกาศที่ไม่เกี่ยว
          </p>
        </div>

        <ul className="divide-border divide-y border-t">
          {values.map(({ title, description, note }, index) => (
            <li key={title} data-rise={index} className="py-8 first:pt-8 lg:py-10">
              <div className="flex items-baseline gap-4">
                <span data-numeric className="text-muted-foreground font-mono text-sm">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <h3 className="text-xl font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-3 max-w-xl">{description}</p>
                  <p className="text-muted-foreground/80 mt-4 text-xs tracking-wide uppercase">
                    {note}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
