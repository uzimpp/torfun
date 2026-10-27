import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { join, relative } from 'node:path';

/**
 * What an officer may see is decided in `services/audience.ts` and nowhere else.
 * A second file that compares an outcome to the analysed one is a second rule,
 * and the day the two disagree is the day a held or dropped record reaches a
 * Business Development Officer. This fails the build before that can happen.
 *
 * `decision.ts` and the administrator's approval write that outcome, but they
 * import the constant from there rather than naming the literal again.
 */

const SRC = join(import.meta.dir, '..');
const MAY_NAME_THE_OUTCOME = new Set(['services/audience.ts']);

async function sourceFilesNamingTheOutcome(): Promise<string[]> {
  const found: string[] = [];
  for await (const path of new Glob('**/*.{ts,tsx}').scan({ cwd: SRC, absolute: true })) {
    if (/\.test\.tsx?$/.test(path)) continue;
    if (/['"`]tor_analysed['"`]/.test(await Bun.file(path).text())) {
      found.push(relative(SRC, path));
    }
  }
  return found.sort();
}

describe('the officer audience rule', () => {
  test('no source file outside the rule and the decision names the analysed outcome', async () => {
    const offenders = (await sourceFilesNamingTheOutcome()).filter(
      (file) => !MAY_NAME_THE_OUTCOME.has(file),
    );
    expect(offenders).toEqual([]);
  });

  test('the scan sees the files that are allowed to, so an empty result is not a broken glob', async () => {
    expect(await sourceFilesNamingTheOutcome()).toEqual([...MAY_NAME_THE_OUTCOME].sort());
  });
});
