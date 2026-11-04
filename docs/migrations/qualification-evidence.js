// mongosh "$MONGODB_URI" docs/migrations/qualification-evidence.js
// Legacy TORs keep their original analysis. Structured clauses come from a
// real PDF read in an ingestion Run, so no qualifications are manufactured here.
// Company profiles and existing work can be edited after deployment. Missing
// qualification profiles read as empty and are created on first save.
db.experiences.updateMany(
  { work_type: { $exists: false } },
  { $set: { work_type: null } },
);
db.experiences.updateMany(
  { contract_value_thb: { $exists: false } },
  { $set: { contract_value_thb: null } },
);
