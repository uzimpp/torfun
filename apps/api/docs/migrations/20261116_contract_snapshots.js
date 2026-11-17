// Run from the repository root:
// mongosh "$MONGODB_URI" apps/api/docs/migrations/20261116_contract_snapshots.js
/* global db */

db.contracts.createIndex({ contractYear: 1, projectId: 1 }, { name: 'contract_year_project' });
db.contract_snapshot_staging.createIndex(
  { contractYear: 1, generation: 1 },
  { name: 'contract_snapshot_generation' },
);
db.contract_snapshot_staging.createIndex(
  { projectId: 1, contractYear: 1, generation: 1 },
  { name: 'contract_snapshot_project' },
);
db.contract_submissions.createIndex(
  { projectId: 1, contractYear: 1 },
  { name: 'contract_submission_project_year' },
);
db.contract_submission_staging.createIndex(
  { projectId: 1, contractYear: 1, generation: 1 },
  { name: 'contract_submission_staging_project' },
);
db.contract_enrichments.createIndex(
  { project_id: 1, contract_year: 1, active_generation: 1 },
  { name: 'contract_enrichment_published' },
);
