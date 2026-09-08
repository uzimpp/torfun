const steps = [
  ['ค้นพบประกาศ', 'รวบรวมประกาศจากข้อมูลเปิด e-GP และคัดกรองเบื้องต้นจากชื่อโครงการ'],
  [
    'อ่านเอกสาร TOR',
    'ดึงเอกสารจากประกาศที่คัดเลือก แล้วใช้ AI ช่วยวิเคราะห์ข้อกำหนดเมื่อมีเอกสารพร้อม',
  ],
  [
    'ตรวจสอบก่อนตัดสินใจ',
    'ให้ทีมอ่านเอกสารต้นฉบับและประเมินความพร้อมของบริษัทก่อนเข้าร่วมการเสนอราคา',
  ],
];
export function WorkflowSection() {
  return (
    <section
      aria-labelledby="workflow-heading"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10"
    >
      <h2 id="workflow-heading" className="text-3xl font-semibold">
        จากประกาศ สู่การพิจารณาที่มีข้อมูล
      </h2>
      <ol className="mt-10 grid gap-5">
        {steps.map(([title, description], index) => (
          <li
            key={title}
            className="bg-card rounded-2xl p-6 md:grid md:grid-cols-[8rem_1fr_1.5fr] md:items-start md:gap-6"
          >
            <span className="text-muted-foreground text-sm">ขั้นตอนที่ {index + 1}</span>
            <h3 className="mt-3 text-xl font-medium md:mt-0">{title}</h3>
            <p className="text-muted-foreground mt-3 leading-relaxed md:mt-0">{description}</p>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-10 border-l-2 pl-4 text-sm leading-relaxed">
        ผลสรุปจาก AI เป็นข้อมูลช่วยอ่าน ไม่ใช่การยืนยันข้อเท็จจริง โปรดตรวจสอบ TOR
        ต้นฉบับและเงื่อนไขของหน่วยงานก่อนยื่นข้อเสนอทุกครั้ง
      </p>
    </section>
  );
}
