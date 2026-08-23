const profileRows = [
  ['ชื่อบริษัท', 'บริษัท เอเอเอ จำกัด'],
  ['อีเมล', 'contact@aaa.co.th'],
  ['เบอร์โทร', '02-123-4567'],
];
export default function ProfilePage() {
  return (
    <section className="mx-auto max-w-[900px]">
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#121b2e] sm:text-4xl">
        โปรไฟล์
      </h1>
      <ProfileSection title="ข้อมูลพื้นฐาน">
        {profileRows.map(([label, value]) => (
          <div className="grid grid-cols-[112px_1fr] gap-3 text-sm" key={label}>
            <dt className="font-semibold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </ProfileSection>
      <ProfileSection title="ความเชี่ยวชาญ">
        <div className="grid gap-3 text-sm">
          <p>
            <span className="font-semibold">เทคโนโลยีที่เชี่ยวชาญ:</span> React, Python, Node.js
          </p>
          <p>
            <span className="font-semibold">ประเภทงานที่รับ:</span> Web application, Mobile
          </p>
        </div>
      </ProfileSection>
      <ProfileSection title="ประสบการณ์โครงการ">
        <div className="grid gap-3 text-sm">
          <p>
            <span className="font-semibold">จำนวนโครงการที่ผ่านมา:</span> 15 โครงการ
          </p>
          <p>
            <span className="font-semibold">มูลค่าโครงการที่เคยทำ:</span> 1,000,000 - 10,000,000 บาท
          </p>
        </div>
      </ProfileSection>
    </section>
  );
}
function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <dl className="mt-3 max-w-xl rounded-xl border border-[#e1e5ed] bg-white p-5 leading-7 shadow-[0_1px_1px_rgba(31,41,66,0.03)]">
        {children}
      </dl>
    </section>
  );
}
