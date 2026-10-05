# @torfun/types

The domain vocabulary as zod schemas, imported by both apps. Change a schema and
both sides fail to compile — that is the point.

Every type is inferred from its schema, so the runtime validator and the compile-
time type can never drift:

```ts
import { ProcurementSchema, type Procurement } from '@torfun/types';
```

| File          | Holds                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `egp.ts`      | `Procurement` and everything it carries: state, outcome, status, software class, documents, analysis, winner |
| `user.ts`     | `User`, `UserRole`, and the `fullName` helper                                                                |
| `session.ts`  | The two session cookie names                                                                                 |
| `matching.ts` | `CompanyProfile`, `MatchResult` and its score breakdown                                                      |

Two rules keep this package a contract rather than a dumping ground. Persistence
shapes never enter it — `_id` and `password_hash` stay inside their repository.
And what the words mean is settled in `CONTEXT.md` at the repo root; read it
before adding a name here.

```bash
bun run typecheck
bun run lint
bun test
```
