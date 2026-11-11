# torfun documentation

| Document | Answers | Audience |
| -------- | ------- | -------- |
| [system-requirements.md](system-requirements.md) | What must the system do, and how well? Requirements with IDs, status and traceability | Product, QA, reviewers |
| [SRS.md](SRS.md) | The team's SRS (30 Aug 2026): user stories and FR/NFR, with implementation status and a list of deviations needing a decision | Product, QA, reviewers |
| [ingestion-flow.md](ingestion-flow.md) | The full retrieval process for one procurement: discovery → detail → timeline → archive → AI analysis → decision, plus refresh, failures and the Gate | Developers, operators |
| [api.md](api.md) | Every HTTP endpoint, who may call it, how a request travels, key sequences | Developers, QA |
| [diagrams/](diagrams/README.md) | All diagrams as PlantUML source with rendered PNG and SVG | Everyone |
| [architecture.md](architecture.md) | How is it built? Context, containers, layers, runtime flows, deployment, cross-cutting concerns, risks | Developers, operators |
| [data-model.md](data-model.md) | What is stored, how it relates, and what the enums mean | Developers |
| [`../CONTEXT.md`](../CONTEXT.md) | The domain vocabulary — canonical; read before naming anything | Everyone |
| [`../AGENTS.md`](../AGENTS.md) | Product intent and guardrails (upstream access, AI output) | Everyone, coding agents |

Diagrams exist in two forms: **PlantUML** sources with rendered **PNG/SVG** in [`diagrams/`](diagrams/README.md) (the images referenced from the pages), and **Mermaid** blocks embedded in the Markdown, which GitHub renders inline.

## Keeping these current

- Edit the `.puml` source, run `diagrams/render.sh`, and commit the regenerated PNG/SVG with it.
- Code is the source of truth; these pages summarise it. When they disagree, fix the doc in the same PR as the code.
- `SRS.md` is the product-level requirement set; `system-requirements.md` holds technical requirements derived from the code. A new product requirement gets the next FR/NFR number in the SRS with a status; a technical rule goes in `system-requirements.md`. Resolve each deviation in SRS §6 by changing the SRS or the code.
- A decision that is expensive to reverse gets an ADR in `docs/adr/` (context, decision, consequences). That directory and `docs/migrations/` are referenced by the README but are not on this branch; see system-requirements §10 (OI-02).
