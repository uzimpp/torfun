'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { FlowError } from '@/components/onboarding/field';
import { FLOW_ACTION } from '@/components/onboarding/controls';
import type { ExperienceResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AddExperienceButton } from './add-experience-button';
import { CompanyBlock } from './company-block';
import { ExperienceForm } from './experience-form';
import { ExperienceList } from './experience-list';
import type { CompanyData } from './use-company-data';

/**
 * The vendor's own record: the Company an officer works for and the work it has
 * delivered.
 *
 * Nothing here is scored. This is the other half of a comparison a later
 * feature will make — a tender says what an agency wants built, and this says
 * what the software house has already built.
 *
 * The same record is reached twice, and the difference is only ever the frame
 * around it. During registration it sits in the onboarding flow and ends with a
 * way on to the dashboard, because at that point finishing the flow is the
 * task. Opened later from the account menu it is a page like any other, and an
 * officer who came to correct one line does not need to be told where to go
 * next. `onboarding` is that difference and nothing else — one record, one set
 * of behaviours, two frames.
 *
 * `data` is passed in rather than read here, because the onboarding frame needs
 * the same answer to decide which step it is showing, and calling the hook in
 * both places would fetch the record twice.
 *
 * Owns only UI state: which form is open, and which client the last entry used.
 * Everything read from or written to the API lives in `useCompanyData`.
 */
export function CompanyRecord({
  data,
  onboarding = false,
}: {
  data: CompanyData;
  onboarding?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExperienceResponse | null>(null);
  /** Remembered so a run of work for one client does not mean re-picking it. */
  const [lastClientId, setLastClientId] = useState<string | null>(null);

  // "Saved on the server", not "typed into the field": an Experience is written
  // against a company id, and there is no id until the API has one.
  const companySaved = data.company !== null;

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div className="grid gap-6">
      {data.error ? <FlowError>{data.error}</FlowError> : null}

      {data.loading ? (
        <CompanyRecordSkeleton />
      ) : (
        <>
          <CompanyBlock
            company={data.company}
            saving={data.saving}
            onCreate={data.createOwnCompany}
            onJoin={data.joinExistingCompany}
            onEdit={data.editOwnCompany}
          />

          <ExperienceList
            clients={data.clients}
            experiences={data.experiences}
            saving={data.saving}
            onEditExperience={(experience) => {
              setEditing(experience);
              setFormOpen(true);
            }}
            onDeleteExperience={(id) => void data.removeExperience(id)}
            onSaveClient={(id, input) =>
              data.saveClient({ name: input.name ?? '', kind: input.kind ?? 'private' }, id)
            }
            onDeleteClient={(id) => void data.removeClient(id)}
          />

          <AddExperienceButton
            available={companySaved}
            onAdd={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />

          {formOpen ? (
            <ExperienceForm
              // Remounts between "edit this one" and "add a new one" so the fields
              // never carry over from the record last opened.
              key={editing?.id ?? 'new'}
              clients={data.clients}
              initial={editing}
              defaultClientId={lastClientId}
              saving={data.saving}
              onCreateClient={(input) => data.saveClient(input)}
              onSubmit={async (input) => {
                const saved = await data.saveExperience(input, editing?.id);
                if (saved) setLastClientId(input.client_id);
                return saved;
              }}
              onCancel={closeForm}
            />
          ) : null}

          {onboarding && companySaved ? (
            <div className="mt-2 grid justify-items-center gap-2 border-t pt-6">
              <Link href="/dashboard" className={cn(buttonVariants(), FLOW_ACTION, 'font-medium')}>
                ไปที่แดชบอร์ด
                <ArrowRight aria-hidden="true" />
              </Link>
              <p className="text-muted-foreground text-xs">
                เพิ่มผลงานภายหลังได้ตลอด ไม่จำเป็นต้องกรอกให้ครบตอนนี้
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Stands in for the two blocks while the first read is in flight.
 *
 * Shaped like what it replaces rather than a spinner: without it the page
 * renders the "you have no company yet" form for as long as the request takes,
 * which reads as an answer when it is only an absence of one.
 */
function CompanyRecordSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">กำลังโหลดข้อมูลบริษัทและผลงาน</span>
      {[
        { title: 'w-40', rows: 2 },
        { title: 'w-32', rows: 3 },
      ].map(({ title, rows }) => (
        <div key={title} className="bg-card animate-pulse rounded-xl border p-6">
          <div className={cn('bg-muted h-5 rounded', title)} />
          <div className="bg-muted mt-3 h-4 w-64 max-w-full rounded" />
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="bg-muted h-11 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
