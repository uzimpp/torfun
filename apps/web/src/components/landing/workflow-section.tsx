const steps = [
  {
    label: 'ค้นพบประกาศ',
    description: 'รวบรวมประกาศจากข้อมูลเปิด e-GP และคัดกรองเบื้องต้นจากชื่อโครงการ',
    meta: 'กว้างและรวดเร็ว',
  },
  {
    label: 'อ่านเอกสาร TOR',
    description: 'ดึงเอกสารจากประกาศที่คัดเลือก แล้วใช้ AI ช่วยวิเคราะห์ข้อกำหนดเมื่อมีเอกสารพร้อม',
    meta: 'จำกัดจำนวนต่อรอบตามข้อตกลงกับต้นทาง',
  },
  {
    label: 'ตรวจสอบก่อนตัดสินใจ',
    description: 'ให้ทีมอ่านเอกสารต้นฉบับและประเมินความพร้อมของบริษัทก่อนเข้าร่วมการเสนอราคา',
    meta: 'คนเป็นผู้ตัดสิน',
  },
];

/**
 * The pipeline, as a person experiences it.
 *
 * The rail down the left is drawn by `LandingMotion` against the scroll
 * position, so how far the line has come matches how far the reader has. With
 * motion disabled it is simply a line.
 *
 * The section sits on a grey band. It is the middle of a long page of pale
 * surfaces, and shifting one chapter a shade darker gives a reader a landmark
 * to scroll between without turning the chapter into a separate product.
 */
export function WorkflowSection() {
  return (
    <section
      aria-labelledby="workflow-heading"
      id="workflow"
      className="bg-muted scroll-mt-24 border-y"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
        <p data-rise="0" className="text-primary text-xs font-medium tracking-wider uppercase">
          ขั้นตอนการทำงาน
        </p>
        <h2
          id="workflow-heading"
          data-rise="1"
          className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          จากประกาศ สู่การพิจารณาที่มีข้อมูล
        </h2>

        <ol className="relative mt-14 ps-9 sm:ps-12">
          {/* The track and the drawn line share a position; the track shows
              where the line is going before it gets there. */}
          <span aria-hidden="true" className="bg-border absolute inset-y-2 start-1 w-px" />
          <span
            aria-hidden="true"
            data-rail
            className="bg-primary absolute inset-y-2 start-1 w-px origin-top"
          />

          {steps.map(({ label, description, meta }, index) => (
            <li
              key={label}
              data-rise={index}
              className="relative pb-12 last:pb-0 md:grid md:grid-cols-[13rem_1fr] md:gap-10"
            >
              <span
                aria-hidden="true"
                className="bg-primary absolute -start-9 top-2.5 size-2 rounded-full sm:-start-12"
              />
              <div>
                <span data-numeric className="text-muted-foreground font-mono text-xs">
                  ขั้นตอนที่ {index + 1}
                </span>
                <h3 className="mt-1 text-xl font-medium">{label}</h3>
              </div>
              <div>
                <p className="text-muted-foreground max-w-xl">{description}</p>
                <p className="text-muted-foreground/75 mt-3 text-xs tracking-wide uppercase">
                  {meta}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
