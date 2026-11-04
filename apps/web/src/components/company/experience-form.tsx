'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { ClientKind, DurationUnit, type TargetPlatform } from '@torfun/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FLOW_ACTION, FLOW_FIELD, FLOW_FIELD_GROUP } from '@/components/onboarding/controls';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchClientSuggestions,
  type ClientInput,
  type ClientResponse,
  type ExperienceInput,
  type ExperienceResponse,
} from '@/lib/api';
import {
  CLIENT_KIND_LABELS,
  DURATION_UNIT_LABELS,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
} from './labels';

/** The option that reveals the inline client fields. */
const NEW_CLIENT = 'new';

/** A native select, sized to match `FLOW_FIELD` so it lines up with the inputs beside it. */
const SELECT_CLASS = cn(
  FLOW_FIELD,
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 border bg-transparent outline-none focus-visible:ring-3',
);

/**
 * Records one piece of work a Company delivered.
 *
 * Only the client and the project name are required — an officer with thirty
 * projects to enter needs to get them down, not to fill in a form. Everything
 * that speeds that up is deliberate: the client defaults to the last one used,
 * platforms are toggles rather than a dropdown, and tech is typed as a
 * comma-separated line instead of one field per item.
 */
export function ExperienceForm({
  clients,
  initial = null,
  defaultClientId = null,
  saving,
  onSubmit,
  onCreateClient,
  onCancel,
}: {
  clients: ClientResponse[];
  /** The experience being edited, or null when adding a new one. */
  initial?: ExperienceResponse | null;
  /** Remembered from the previous entry, so a run of work for one client is fast. */
  defaultClientId?: string | null;
  saving: boolean;
  onSubmit: (input: ExperienceInput) => Promise<boolean>;
  onCreateClient: (input: ClientInput) => Promise<ClientResponse | null>;
  onCancel: () => void;
}) {
  const ids = useId();

  const [clientId, setClientId] = useState<string>(
    initial?.client_id ?? defaultClientId ?? (clients[0]?.id || NEW_CLIENT),
  );
  const [newClientName, setNewClientName] = useState('');
  const [newClientKind, setNewClientKind] = useState<ClientKind>('government');
  /** Suggestions carry the kind they were fetched for, so switching between
   *  government and private never shows the other list. */
  const [suggested, setSuggested] = useState<{ kind: ClientKind; names: string[] } | null>(null);

  const [projectName, setProjectName] = useState(initial?.project_name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [techStack, setTechStack] = useState((initial?.tech_stack ?? []).join(', '));
  const [platforms, setPlatforms] = useState<TargetPlatform[]>(initial?.target_platforms ?? []);
  const [durationValue, setDurationValue] = useState(
    initial?.duration_value === null || initial?.duration_value === undefined
      ? ''
      : String(initial.duration_value),
  );
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    initial?.duration_unit ?? 'months',
  );

  const [error, setError] = useState<string | null>(null);

  const creatingClient = clientId === NEW_CLIENT;
  const suggestions = suggested?.kind === newClientKind ? suggested.names : [];

  // Government names come from agency names the ingestion already holds, so an
  // officer's spelling matches what the tenders say.
  useEffect(() => {
    if (!creatingClient) return;
    let cancelled = false;
    const kind = newClientKind;
    const timer = setTimeout(() => {
      fetchClientSuggestions(kind, newClientName.trim()).then(
        (data) => {
          if (!cancelled) setSuggested({ kind, names: data.suggestions });
        },
        () => {
          // A suggestion list is a convenience; failing to load one must not
          // stop an officer typing the name themselves.
          if (!cancelled) setSuggested({ kind, names: [] });
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [creatingClient, newClientKind, newClientName]);

  function togglePlatform(platform: TargetPlatform) {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((entry) => entry !== platform)
        : [...current, platform],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (projectName.trim() === '') {
      setError('กรุณากรอกชื่อโครงการ');
      return;
    }

    let targetClientId = clientId;
    if (creatingClient) {
      if (newClientName.trim() === '') {
        setError('กรุณากรอกชื่อลูกค้า');
        return;
      }
      const created = await onCreateClient({ name: newClientName.trim(), kind: newClientKind });
      if (!created) return;
      targetClientId = created.id;
    }

    const parsedDuration = durationValue.trim() === '' ? null : Number(durationValue);
    if (parsedDuration !== null && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
      setError('ระยะเวลาต้องเป็นตัวเลขมากกว่าศูนย์');
      return;
    }

    const saved = await onSubmit({
      client_id: targetClientId,
      project_name: projectName.trim(),
      description: description.trim() === '' ? null : description.trim(),
      tech_stack: techStack
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ''),
      target_platforms: platforms,
      duration_value: parsedDuration,
      // Null together: a unit with no length says nothing.
      duration_unit: parsedDuration === null ? null : durationUnit,
    });

    if (saved) onCancel();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? 'แก้ไขผลงาน' : 'เพิ่มผลงาน'}</CardTitle>
        <CardDescription>
          กรอกเฉพาะลูกค้าและชื่อโครงการก็บันทึกได้ ส่วนที่เหลือเติมภายหลังได้
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={`${ids}-client`}>ลูกค้า</Label>
            <select
              id={`${ids}-client`}
              className={SELECT_CLASS}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} ({CLIENT_KIND_LABELS[client.kind]})
                </option>
              ))}
              <option value={NEW_CLIENT}>+ สร้างลูกค้าใหม่</option>
            </select>
          </div>

          {creatingClient ? (
            <div className="border-border flex flex-col gap-4 rounded-lg border p-3">
              <div className={FLOW_FIELD_GROUP}>
                <Label htmlFor={`${ids}-client-name`}>ชื่อลูกค้าใหม่</Label>
                <Input
                  className={FLOW_FIELD}
                  id={`${ids}-client-name`}
                  list={`${ids}-client-suggestions`}
                  value={newClientName}
                  maxLength={200}
                  onChange={(event) => setNewClientName(event.target.value)}
                  placeholder="เช่น กรมสรรพากร"
                />
                <datalist id={`${ids}-client-suggestions`}>
                  {suggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>

              <fieldset className={FLOW_FIELD_GROUP}>
                <legend className="text-sm leading-none font-medium">ประเภทลูกค้า</legend>
                <div className="mt-1.5 flex gap-2">
                  {ClientKind.options.map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      variant={newClientKind === kind ? 'default' : 'outline'}
                      aria-pressed={newClientKind === kind}
                      onClick={() => setNewClientKind(kind)}
                    >
                      {CLIENT_KIND_LABELS[kind]}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={`${ids}-project`}>ชื่อโครงการ</Label>
            <Input
              className={FLOW_FIELD}
              id={`${ids}-project`}
              value={projectName}
              maxLength={300}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="เช่น ระบบบริหารจัดการเอกสารอิเล็กทรอนิกส์"
            />
          </div>

          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={`${ids}-description`}>รายละเอียด (ไม่บังคับ)</Label>
            <Textarea
              className="rounded-lg text-base md:text-sm"
              id={`${ids}-description`}
              value={description}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={`${ids}-tech`}>เทคโนโลยีที่ใช้ (ไม่บังคับ)</Label>
            <Input
              className={FLOW_FIELD}
              id={`${ids}-tech`}
              value={techStack}
              onChange={(event) => setTechStack(event.target.value)}
              placeholder="คั่นด้วยเครื่องหมายจุลภาค เช่น React, Node.js, PostgreSQL"
            />
          </div>

          <fieldset className={FLOW_FIELD_GROUP}>
            <legend className="text-sm leading-none font-medium">แพลตฟอร์ม (ไม่บังคับ)</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PLATFORM_ORDER.map((platform) => (
                <Button
                  key={platform}
                  type="button"
                  size="sm"
                  variant={platforms.includes(platform) ? 'default' : 'outline'}
                  aria-pressed={platforms.includes(platform)}
                  onClick={() => togglePlatform(platform)}
                >
                  {PLATFORM_LABELS[platform]}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={`${ids}-duration`}>ระยะเวลา (ไม่บังคับ)</Label>
            <div className="flex gap-2">
              <Input
                className={cn(FLOW_FIELD, 'w-24')}
                id={`${ids}-duration`}
                inputMode="numeric"
                value={durationValue}
                onChange={(event) => setDurationValue(event.target.value)}
              />
              <select
                aria-label="หน่วยของระยะเวลา"
                className={SELECT_CLASS}
                value={durationUnit}
                onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
              >
                {DurationUnit.options.map((unit) => (
                  <option key={unit} value={unit}>
                    {DURATION_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className={FLOW_ACTION}>
              บันทึกผลงาน
            </Button>
            <Button type="button" variant="ghost" className={FLOW_ACTION} onClick={onCancel}>
              ยกเลิก
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
