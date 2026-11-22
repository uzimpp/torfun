// PR dependency gate. Fails when:
//  - the head lockfile has any advisory at or above the `always` level (default
//    critical), whether or not the base branch already had it, so a known critical
//    on develop/main keeps every PR red until it is fixed (#204, R-14); or
//  - the head lockfile has an advisory at or above `level` (default high) that the
//    base lockfile does not, so a PR is not blocked for a known high it didn't add.
// Usage: bun new-advisories.ts <base-audit.json> <head-audit.json> [level] [always]

export type Advisory = { url: string; title: string; severity: string };
export type Report = Record<string, Advisory[]>;

export const LEVELS = ['low', 'moderate', 'high', 'critical'];

const atLeast = (severity: string, level: string) =>
  LEVELS.indexOf(severity) >= LEVELS.indexOf(level);
const key = (pkg: string, advisory: Advisory) => `${pkg} ${advisory.url}`;
const describe = (pkg: string, advisory: Advisory) =>
  `${advisory.severity}: ${pkg} - ${advisory.title} - ${advisory.url}`;

export function blockingAdvisories(
  base: Report,
  head: Report,
  level = 'high',
  always = 'critical',
): { present: string[]; introduced: string[] } {
  const known = new Set(
    Object.entries(base).flatMap(([pkg, list]) => list.map((advisory) => key(pkg, advisory))),
  );
  const entries = Object.entries(head).flatMap(([pkg, list]) =>
    list.map((advisory) => ({ pkg, advisory })),
  );
  const present = entries.filter(({ advisory }) => atLeast(advisory.severity, always));
  const introduced = entries.filter(
    ({ pkg, advisory }) =>
      !atLeast(advisory.severity, always) &&
      atLeast(advisory.severity, level) &&
      !known.has(key(pkg, advisory)),
  );
  return {
    present: present.map(({ pkg, advisory }) => describe(pkg, advisory)),
    introduced: introduced.map(({ pkg, advisory }) => describe(pkg, advisory)),
  };
}

if (import.meta.main) {
  const [basePath, headPath, level = 'high', always = 'critical'] = Bun.argv.slice(2);
  if (!basePath || !headPath || !LEVELS.includes(level) || !LEVELS.includes(always)) {
    console.error(
      'usage: new-advisories.ts <base.json> <head.json> [level] [always]  (levels: low|moderate|high|critical)',
    );
    process.exit(2);
  }

  const read = async (path: string): Promise<Report> => JSON.parse(await Bun.file(path).text());
  const { present, introduced } = blockingAdvisories(
    await read(basePath),
    await read(headPath),
    level,
    always,
  );

  if (present.length > 0) {
    console.error(
      `The lockfile has ${present.length} ${always}-or-above advisories (fails whether or not this PR added them):`,
    );
    for (const line of present) console.error(`  ${line}`);
  }
  if (introduced.length > 0) {
    console.error(`This PR introduces ${introduced.length} advisories (${level} or above):`);
    for (const line of introduced) console.error(`  ${line}`);
  }
  if (present.length > 0 || introduced.length > 0) process.exit(1);
  console.log(`No ${always} advisories, and no new ${level}-or-above advisories from this PR.`);
}
