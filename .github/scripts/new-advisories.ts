// Fails only on advisories at or above the given level that the head lockfile
// has and the base lockfile does not, so a PR is never blocked for what it didn't add.
// Usage: bun new-advisories.ts <base-audit.json> <head-audit.json> [level]

type Advisory = { url: string; title: string; severity: string };
type Report = Record<string, Advisory[]>;

const LEVELS = ['low', 'moderate', 'high', 'critical'];

const [basePath, headPath, level = 'high'] = Bun.argv.slice(2);
if (!basePath || !headPath || !LEVELS.includes(level)) {
  console.error('usage: new-advisories.ts <base.json> <head.json> [low|moderate|high|critical]');
  process.exit(2);
}

const read = async (path: string): Promise<Report> => JSON.parse(await Bun.file(path).text());
const key = (pkg: string, advisory: Advisory) => `${pkg} ${advisory.url}`;

const base = await read(basePath);
const head = await read(headPath);
const known = new Set(
  Object.entries(base).flatMap(([pkg, list]) => list.map((advisory) => key(pkg, advisory))),
);

const introduced = Object.entries(head).flatMap(([pkg, list]) =>
  list
    .filter((advisory) => LEVELS.indexOf(advisory.severity) >= LEVELS.indexOf(level))
    .filter((advisory) => !known.has(key(pkg, advisory)))
    .map((advisory) => `${advisory.severity}: ${pkg} - ${advisory.title} - ${advisory.url}`),
);

if (introduced.length > 0) {
  console.error(`This PR introduces ${introduced.length} advisories (${level} or above):`);
  for (const line of introduced) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`No new ${level}-or-above advisories introduced by this PR.`);
