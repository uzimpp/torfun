import { describe, expect, test } from 'bun:test';
import { DiagnosticsService, type DependencyProbe } from './diagnostics.service';

const probe = (name: string, check: DependencyProbe['check']): DependencyProbe => ({ name, check });

describe('DiagnosticsService', () => {
  test('reports each dependency with the detail it returned', async () => {
    const service = new DiagnosticsService([
      probe('mongodb', async () => 'database torfun'),
      probe('vertex-ai', async () => 'replied "ok"'),
    ]);

    expect(await service.run()).toEqual({
      ok: true,
      checks: [
        { name: 'mongodb', ok: true, detail: 'database torfun' },
        { name: 'vertex-ai', ok: true, detail: 'replied "ok"' },
      ],
    });
  });

  test('one broken dependency does not hide the others', async () => {
    // The point of this endpoint is telling you which one is wrong. Failing at
    // the first would send you back to guessing.
    const service = new DiagnosticsService([
      probe('mongodb', async () => {
        throw new Error('bad auth : authentication failed');
      }),
      probe('egp-open-data', async () => '10 rows'),
    ]);

    const result = await service.run();
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toEqual({
      name: 'mongodb',
      ok: false,
      detail: 'bad auth : authentication failed',
    });
    expect(result.checks[1]?.ok).toBe(true);
  });

  test('a probe that hangs is reported, not waited on forever', async () => {
    const service = new DiagnosticsService([probe('slow', () => new Promise<string>(() => {}))], {
      timeoutMs: 50,
    });

    const result = await service.run();
    expect(result.ok).toBe(false);
    expect(result.checks[0]?.detail).toMatch(/timed out/i);
  });

  test('a thrown non-Error is still reported as a string', async () => {
    const service = new DiagnosticsService([
      probe('odd', async () => {
        throw 'just a string';
      }),
    ]);

    expect((await service.run()).checks[0]?.detail).toBe('just a string');
  });
});
