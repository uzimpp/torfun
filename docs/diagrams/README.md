# Diagrams

PlantUML sources live in [`src/`](src); rendered output is in [`png/`](png)
(for docs and slides) and [`svg/`](svg) (scalable, searchable text). The images
are committed so they show up on GitHub and in any viewer without tooling.

| # | Diagram | Shows | Used in |
| - | ------- | ----- | ------- |
| 01 | [System context](png/01-system-context.png) | Users, torfun, and the external systems | architecture |
| 02 | [Containers and layers](png/02-containers-and-layers.png) | Web, API layers, shared types | architecture |
| 03 | [Ingestion flow](png/03-ingestion-flow.png) | **Full retrieval flow of one new procurement** | ingestion-flow |
| 04 | [Ingestion sequence](png/04-ingestion-sequence.png) | Who talks to whom, in order | ingestion-flow |
| 05 | [Refresh flow](png/05-refresh-flow.png) | Re-reading a project already read | ingestion-flow |
| 06 | [Failure handling](png/06-failure-handling.png) | What each kind of failure does to a record | ingestion-flow |
| 07 | [Document analysis](png/07-document-analysis.png) | ZIP to decision: selection, size fallbacks, roles | ingestion-flow |
| 08 | [Outcome lifecycle](png/08-outcome-lifecycle.png) | State and Outcome transitions | ingestion-flow |
| 09 | [Domain model](png/09-domain-model.png) | Entities, fields, relations, collections | data-model |
| 10 | [API request lifecycle](png/10-api-request-lifecycle.png) | Hooks, validation, service, errors | api |
| 11 | [API route map](png/11-api-route-map.png) | Every route by access level | api |
| 12 | [Officer reads a TOR](png/12-seq-officer-reads-tor.png) | Search, detail, source PDF | api |
| 13 | [Admin runs ingestion](png/13-seq-admin-run.png) | Start, poll, stop | api |
| 14 | [Admin resolves a held record](png/14-seq-admin-moderation.png) | Approve, non-software, delete | api |
| 15 | [Authentication](png/15-seq-auth.png) | Login, refresh rotation, Google | api |
| 16 | [Use cases](png/16-use-cases.png) | SRS user stories, built vs planned | SRS |
| 17 | [Deployment](png/17-deployment.png) | CI, release, Cloud Run, secrets | architecture |
| 18 | [Gate and queue](png/18-gate-and-queue.png) | Tier priority, waiting room, pick() | ingestion-flow |

![Full ingestion flow](png/03-ingestion-flow.png)

## Regenerating

Needs Java 17+ and `plantuml.jar`. The sources use PlantUML's built-in
**Smetana** layout, so Graphviz is not required.

```bash
PLANTUML_JAR=/path/to/plantuml.jar docs/diagrams/render.sh
```

(or put a `plantuml` command on `PATH`). The script lifts PlantUML's default
4096 px image cap, which would otherwise silently clip tall diagrams such as
the ingestion flow.

Rules: edit the `.puml`, never the image; keep text ASCII (fonts vary between
machines); shared styling is in `src/style.iuml`; commit the regenerated
`png/` and `svg/` together with the source change.

Mermaid versions of several diagrams are also embedded in the Markdown pages.
When the flow changes, update both, or delete the Mermaid copy.
