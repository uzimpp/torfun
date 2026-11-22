# torfun documentation

| Page | Answers | Audience |
| ---- | ------- | -------- |
| [SRS.md](SRS.md) | What must the product do? The team SRS (30 August 2026) with the implementation status of each requirement and a log of deviations that need a decision | Product, QA, reviewers |
| [system-requirements.md](system-requirements.md) | The technical rules read from the code: upstream limits, security, reliability, data | Developers, QA |
| [architecture.md](architecture.md) | How is it built? Context, layers, deployment, cross-cutting concerns, risks | Developers, operators |
| [ingestion-flow.md](ingestion-flow.md) | How one procurement travels from the e-GP feed to a decided record, and what happens when it fails | Developers, operators |
| [api.md](api.md) | Every HTTP endpoint, who may call it, and how a request travels | Developers, QA |
| [data-model.md](data-model.md) | What is stored, how it relates, and what the enums mean | Developers |
| [diagrams/](diagrams/README.md) | The five diagrams that matter, as PlantUML source with rendered PNG | Everyone |
| [`../CONTEXT.md`](../CONTEXT.md) | The domain vocabulary. Read it before naming anything | Everyone |
| [`../AGENTS.md`](../AGENTS.md) | Product intent and guardrails for upstream access and AI output | Everyone, coding agents |

## Keeping the docs current

- The code is the source of truth. Fix the doc in the same PR as the code that changes it.
- Edit a diagram's `.puml` source, run `diagrams/render.sh`, and commit the regenerated PNG with it.
- A product requirement takes the next FR or NFR number in the SRS with a status. A technical rule goes in `system-requirements.md`.
- Resolve each deviation in SRS section 6.2 by changing the SRS or the code.
- `docs/adr/` and `docs/migrations/` are referenced by the root README but are not on this branch (SRS section 6.2, D-09, and system-requirements OI-02).
