'use client';

import { useId, useState } from 'react';
import { ClientKind, displayDuration } from '@torfun/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ClientInput, ClientResponse, ExperienceResponse } from '@/lib/api';
import { CLIENT_KIND_LABELS, DURATION_UNIT_LABELS, PLATFORM_LABELS } from './labels';

/** "2 ปี", never "24 เดือน" — the page shows back what the officer typed. */
function durationText(experience: ExperienceResponse): string | null {
  const shown = displayDuration(experience.duration_months, experience.duration_unit);
  if (shown) return `${shown.value} ${DURATION_UNIT_LABELS[shown.unit]}`;
  // The API is the source of `duration_months`; fall back to what was typed if
  // only that reached us, rather than showing nothing.
  if (experience.duration_value !== null && experience.duration_unit !== null) {
    return `${experience.duration_value} ${DURATION_UNIT_LABELS[experience.duration_unit]}`;
  }
  return null;
}

function ExperienceRow({
  experience,
  saving,
  onEdit,
  onDelete,
}: {
  experience: ExperienceResponse;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const duration = durationText(experience);

  return (
    <li className="border-border flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{experience.project_name}</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            แก้ไข
          </Button>
          <Button size="sm" variant="destructive" disabled={saving} onClick={onDelete}>
            ลบ
          </Button>
        </div>
      </div>

      {experience.description ? (
        <p className="text-muted-foreground text-sm">{experience.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {experience.target_platforms.map((platform) => (
          <Badge key={platform} variant="secondary">
            {PLATFORM_LABELS[platform]}
          </Badge>
        ))}
        {experience.tech_stack.map((tech) => (
          <Badge key={tech} variant="outline">
            {tech}
          </Badge>
        ))}
        {duration ? (
          <span className="text-muted-foreground text-sm">ระยะเวลา {duration}</span>
        ) : null}
      </div>
    </li>
  );
}

function ClientGroup({
  client,
  experiences,
  saving,
  onEditExperience,
  onDeleteExperience,
  onSaveClient,
  onDeleteClient,
}: {
  client: ClientResponse;
  experiences: ExperienceResponse[];
  saving: boolean;
  onEditExperience: (experience: ExperienceResponse) => void;
  onDeleteExperience: (id: string) => void;
  onSaveClient: (id: string, input: Partial<ClientInput>) => Promise<unknown>;
  onDeleteClient: (id: string) => void;
}) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [kind, setKind] = useState(client.kind);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-base font-semibold">
          {client.name}
        </h3>
        <Badge variant={client.kind === 'government' ? 'default' : 'secondary'}>
          {CLIENT_KIND_LABELS[client.kind]}
        </Badge>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing((current) => !current)}>
            {editing ? 'ยกเลิก' : 'แก้ไขลูกค้า'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={saving}
            onClick={() => onDeleteClient(client.id)}
          >
            ลบลูกค้า
          </Button>
        </div>
      </div>

      {editing ? (
        <form
          className="border-border flex flex-wrap items-end gap-2 rounded-lg border p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSaveClient(client.id, { name: name.trim(), kind });
            setEditing(false);
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label className="text-sm leading-none font-medium" htmlFor={`${headingId}-name`}>
              ชื่อลูกค้า
            </label>
            <Input
              id={`${headingId}-name`}
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {ClientKind.options.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={kind === option ? 'default' : 'outline'}
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
              >
                {CLIENT_KIND_LABELS[option]}
              </Button>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            บันทึกลูกค้า
          </Button>
        </form>
      ) : null}

      {experiences.length === 0 ? (
        <p className="text-muted-foreground text-sm">ยังไม่มีผลงานกับลูกค้ารายนี้</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {experiences.map((experience) => (
            <ExperienceRow
              key={experience.id}
              experience={experience}
              saving={saving}
              onEdit={() => onEditExperience(experience)}
              onDelete={() => onDeleteExperience(experience.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The Company's past work, grouped by Client.
 *
 * Grouping is the point rather than decoration: a long relationship with one
 * agency reads as one heading and several projects instead of the client's name
 * repeated fifteen times.
 */
export function ExperienceList({
  clients,
  experiences,
  saving,
  onEditExperience,
  onDeleteExperience,
  onSaveClient,
  onDeleteClient,
}: {
  clients: ClientResponse[];
  experiences: ExperienceResponse[];
  saving: boolean;
  onEditExperience: (experience: ExperienceResponse) => void;
  onDeleteExperience: (id: string) => void;
  onSaveClient: (id: string, input: Partial<ClientInput>) => Promise<unknown>;
  onDeleteClient: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ผลงานที่ผ่านมา</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">ยังไม่มีผลงานที่บันทึกไว้</p>
        ) : (
          clients.map((client) => (
            <ClientGroup
              key={client.id}
              client={client}
              experiences={experiences.filter((entry) => entry.client_id === client.id)}
              saving={saving}
              onEditExperience={onEditExperience}
              onDeleteExperience={onDeleteExperience}
              onSaveClient={onSaveClient}
              onDeleteClient={onDeleteClient}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
