# @torfun/config

Shared TypeScript and ESLint bases. No build step; every workspace consumes the
files directly.

| File              | Extended by                                      |
| ----------------- | ------------------------------------------------ |
| `base.json`       | The other two tsconfigs, never an app directly   |
| `node.json`       | `apps/api`, `packages/types` — Bun types, ES2022 |
| `nextjs.json`     | `apps/web` — DOM libs, JSX, the Next plugin      |
| `eslint/base.mjs` | `apps/api` and `packages/types`, as `baseConfig` |

`baseConfig` is recommended JS and TypeScript rules with Prettier's conflicting
formatting rules switched off. `apps/api` layers its own boundary rules on top;
those are documented in that app's `AGENTS.md`. `apps/web` uses
`eslint-config-next` instead, which already carries equivalent rules.
