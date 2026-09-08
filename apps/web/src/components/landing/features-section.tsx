import { Separator } from '@/components/ui/separator';
const features = [
  [
    'คัดกรองประกาศที่เกี่ยวข้อง',
    'มุ่งเน้นงานซอฟต์แวร์แบบ e-bidding ในกรุงเทพมหานคร เพื่อช่วยจัดลำดับประกาศที่ควรนำมาอ่านต่อ',
  ],
  [
    'ทำความเข้าใจข้อกำหนด TOR',
    'แนวทางของระบบคือใช้ AI ช่วยสรุปความต้องการจากเอกสาร เพื่อให้ทีมกลับไปตรวจสอบรายละเอียดได้ตรงประเด็น',
  ],
  [
    'พิจารณาความเหมาะสมกับทีม',
    'การเทียบข้อกำหนดกับประสบการณ์ของบริษัทเป็นเป้าหมายของระบบ เพื่อช่วยประกอบการประเมินโอกาสก่อนตัดสินใจ',
  ],
];
export function FeaturesSection() {
  return (
    <section aria-labelledby="features-heading" className="bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:px-10">
        <div>
          <h2 id="features-heading" className="text-3xl leading-relaxed font-semibold text-balance">
            ลดเวลาค้นหา
            <br />
            เพิ่มเวลาให้การพิจารณา
          </h2>
          <p className="text-muted-foreground mt-4">สิ่งที่ Torfun มุ่งช่วยทีมพัฒนาธุรกิจ</p>
        </div>
        <div>
          {features.map(([title, description], index) => (
            <div key={title}>
              {index > 0 && <Separator className="my-7" />}
              <h3 className="text-primary text-xl font-medium">{title}</h3>
              <p className="text-muted-foreground mt-3 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
