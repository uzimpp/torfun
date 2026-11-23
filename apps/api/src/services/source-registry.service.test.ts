import { describe, expect, test } from 'bun:test';
import { MAX_SOURCE_AGENCIES } from '@torfun/types';
import { ConflictError, NotFoundError } from '../core/errors';
import { InMemorySourceRegistryStore } from '../testing/source-registry-store';
import { KNOWN_AGENCIES, SourceRegistryService } from './source-registry.service';

const NOW = new Date('2026-11-01T05:00:00.000Z');
const build = () => {
  const store = new InMemorySourceRegistryStore();
  return { store, service: new SourceRegistryService(store, () => NOW) };
};

describe('SourceRegistryService', () => {
  test('starts as the shipped list, untouched in the store', async () => {
    const { store, service } = build();

    const view = await service.get();

    expect(view.isDefault).toBe(true);
    expect(view.items).toEqual([...KNOWN_AGENCIES]);
    expect(view.available).toEqual([]);
    expect(await store.get()).toBeNull();
  });

  test('removing an agency offers it back as available and records who did it', async () => {
    const { service } = build();

    const view = await service.remove('0305', 'admin-1');

    expect(view.items.map((agency) => agency.deptId)).not.toContain('0305');
    expect(view.available.map((agency) => agency.deptId)).toEqual(['0305']);
    expect(view.isDefault).toBe(false);
    expect(view.updatedBy).toBe('admin-1');
    expect(view.updatedAt).toBe(NOW.toISOString());
    expect((await service.agencies()).map((agency) => agency.deptId)).not.toContain('0305');
  });

  test('adds a new agency, rejects a duplicate id', async () => {
    const { service } = build();

    const view = await service.add({ deptId: '0999', deptName: 'หน่วยงานทดสอบ' }, 'admin-1');
    expect(view.items.at(-1)).toEqual({ deptId: '0999', deptName: 'หน่วยงานทดสอบ' });

    await expect(service.add({ deptId: '0999', deptName: 'อีกชื่อ' }, 'admin-1')).rejects.toThrow(
      ConflictError,
    );
  });

  test('refuses to grow past the cap', async () => {
    const { service } = build();
    for (let i = KNOWN_AGENCIES.length; i < MAX_SOURCE_AGENCIES; i += 1) {
      await service.add({ deptId: String(1000 + i), deptName: `agency ${i}` }, 'admin-1');
    }

    await expect(
      service.add({ deptId: '9999', deptName: 'one too many' }, 'admin-1'),
    ).rejects.toThrow(ConflictError);
  });

  test('edits a name but never the id; unknown ids are not found', async () => {
    const { service } = build();

    const view = await service.edit('0307', { deptName: 'กรมสรรพากร (ใหม่)' }, 'admin-1');
    expect(view.items.find((agency) => agency.deptId === '0307')?.deptName).toBe(
      'กรมสรรพากร (ใหม่)',
    );

    await expect(service.edit('0000', { deptName: 'x' }, 'admin-1')).rejects.toThrow(NotFoundError);
    await expect(service.remove('0000', 'admin-1')).rejects.toThrow(NotFoundError);
  });

  test('removing every agency is allowed and leaves nothing to read', async () => {
    const { service } = build();
    for (const agency of KNOWN_AGENCIES) await service.remove(agency.deptId, 'admin-1');

    expect(await service.agencies()).toEqual([]);
  });
});
