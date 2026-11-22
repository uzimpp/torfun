// mongosh "$MONGODB_URI" --file docs/migrations/notification-policy.js
// Idempotent metadata migration only. No procurement evidence is changed.
// Readers also supply these defaults, so deploy does not depend on timing this script.
db.notification_contacts.updateMany(
  { 'preferences.new_open': { $exists: false } },
  { $set: { 'preferences.new_open': { in_app: false, email: false, line: false } } },
);
db.notification_contacts.updateMany(
  { 'preferences.filters': { $exists: false } },
  {
    $set: {
      'preferences.filters': {
        agencies: [],
        min_budget: null,
        max_budget: null,
        work_types: [],
        min_qualification_score: null,
      },
    },
  },
);
// Old observations omit deadline_at. The first fresh read establishes a baseline;
// it must not invent a deadline-change event from missing historical evidence.
