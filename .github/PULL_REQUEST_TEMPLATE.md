## Summary

<!-- What does this PR do, and why? -->

## Type of change

- [ ] Feature
- [ ] Fix
- [ ] Chore / refactor
- [ ] Docs
- [ ] CI/CD or infra

## Checklist

- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes
- [ ] `bun run test:e2e` passes (if `apps/web` changed)
- [ ] Manually tested the change locally

## Notes for reviewer

<!-- Anything that needs extra attention, tradeoffs made, follow-ups intentionally left out, etc. -->

---

**If this PR targets `main`:** merging will automatically build, scan, and deploy both `api` and `web` to Cloud Run (see `.github/workflows/docker.yml`). Make sure `develop` has already been validated before opening this.
