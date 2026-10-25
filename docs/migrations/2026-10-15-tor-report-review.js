// mongosh "$MONGODB_URI" --file docs/migrations/2026-10-15-tor-report-review.js
// Idempotent index setup for US-21 / FR-43. Existing reports remain pending.
// Missing publication_removed_at means published; no evidence is backfilled.
// Review/removal requires a replica set (including Atlas), for atomic commits.
db.tor_reports.createIndex({ status: 1, created_at: -1, _id: -1 });
