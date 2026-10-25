// mongosh "$MONGODB_URI" --file docs/migrations/2026-10-11-tor-reports.js
// Idempotent setup for the new report collection. No procurement data changes.
// The API creates these same indexes lazily for local development.
db.tor_reports.createIndex(
  { project_id: 1, reporter_id: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_report' },
);
db.tor_reports.createIndex({ created_at: -1, _id: -1 });
