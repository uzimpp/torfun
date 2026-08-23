'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { EmptyState } from '@/components/states/empty-state';
import { TorGrid } from '@/components/tors/tor-grid';
import type { TorWithMatch } from '../types';

export function SearchPage({ tors }: { tors: TorWithMatch[] }) {
  const [query, setQuery] = useState('');
  const [agency, setAgency] = useState('');
  const [technology, setTechnology] = useState('');
  const [score, setScore] = useState('');
  const [sort, setSort] = useState('deadline');
  const results = useMemo(
    () =>
      tors
        .filter(
          (tor) =>
            `${tor.title} ${tor.agency}`
              .toLocaleLowerCase('th-TH')
              .includes(query.toLocaleLowerCase('th-TH')) &&
            (!agency || tor.agency === agency) &&
            (!technology || tor.techStack.includes(technology)) &&
            (!score || (tor.match?.overallScore ?? 0) * 100 >= Number(score)),
        )
        .sort((a, b) =>
          sort === 'match'
            ? (b.match?.overallScore ?? 0) - (a.match?.overallScore ?? 0)
            : sort === 'published'
              ? b.publishedAt.getTime() - a.publishedAt.getTime()
              : a.deadlineAt.getTime() - b.deadlineAt.getTime(),
        ),
    [agency, query, score, sort, technology, tors],
  );
  const agencies = [...new Set(tors.map((tor) => tor.agency))];
  const technologies = [...new Set(tors.flatMap((tor) => tor.techStack))];
  return (
    <section className="mx-auto max-w-[1320px]">
      <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#121b2e] sm:text-4xl">
        ค้นหา
      </h1>
      <form
        className="mt-7 rounded-xl border border-[#e1e5ed] bg-white p-5 shadow-[0_1px_1px_rgba(31,41,66,0.03)]"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="block text-sm font-semibold" htmlFor="tor-search">
          ค้นหาโครงการ
        </label>
        <div className="relative mt-2 max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[#758197]" />
          <input
            id="tor-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อโครงการ / หน่วยงาน"
            className="h-11 w-full rounded-lg border border-[#d7dce5] bg-white pr-3 pl-10 text-sm outline-none placeholder:text-[#7c8798] focus:border-[#3974d8] focus:ring-3 focus:ring-[#3974d8]/15"
          />
        </div>
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">ตัวกรอง</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="หน่วยงาน" value={agency} onChange={setAgency} options={agencies} />
            <Select
              label="เทคโนโลยี"
              value={technology}
              onChange={setTechnology}
              options={technologies}
            />
            <Select
              label="% ความเหมาะสม"
              value={score}
              onChange={setScore}
              options={['70', '80']}
              values={['70', '80']}
            />
            <Select
              label="เรียงลำดับตาม"
              value={sort}
              onChange={setSort}
              options={['กำหนดส่งใกล้สุด', 'ประกาศล่าสุด', 'ความเหมาะสมสูงสุด']}
              values={['deadline', 'published', 'match']}
            />
          </div>
        </fieldset>
      </form>
      <div className="mt-7 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">พบ {results.length} รายการ</h2>
        <p className="text-sm text-[#6d788a]">อัปเดตจากข้อมูลตัวอย่าง</p>
      </div>
      <div className="mt-4">
        {results.length ? (
          <TorGrid tors={results} />
        ) : (
          <EmptyState
            title="ไม่พบ TOR ที่ตรงกับตัวกรอง"
            description="ลองเปลี่ยนคำค้นหา หรือลดเงื่อนไขการกรองลง"
          />
        )}
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  values,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  values?: string[];
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-[#3c475a]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[#d7dce5] bg-white px-3 text-sm outline-none focus:border-[#3974d8] focus:ring-3 focus:ring-[#3974d8]/15"
      >
        <option value="">ทั้งหมด</option>
        {options.map((option, index) => (
          <option key={option} value={values?.[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
