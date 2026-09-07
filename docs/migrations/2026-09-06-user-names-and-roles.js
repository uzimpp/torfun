// Reconciles stored users with the `UserSchema` in packages/types.
//
//   docker compose up -d mongodb
//   mongosh "$MONGODB_URI" docs/migrations/2026-09-06-user-names-and-roles.js
//
// Idempotent: every step filters on the old shape, so re-running is a no-op.

const users = db.getCollection('users');

// 1. Roles. 'USER'/'ADMIN' predate USR-10's vocabulary; the schema now uses the
//    requirement's own names. `require_admin` compares against 'admin'.
print(
  'roles -> business_development_officer: ' +
    users.updateMany({ role: 'USER' }, { $set: { role: 'business_development_officer' } })
      .modifiedCount,
);
print(
  'roles -> admin: ' +
    users.updateMany({ role: 'ADMIN' }, { $set: { role: 'admin' } }).modifiedCount,
);

// 2. Names. Accounts created before first_name/last_name existed get the
//    username as a first name so the required fields are non-empty and the
//    person is still recognisable in the UI. Correct them by hand afterwards.
let named = 0;
for (const user of users.find({ first_name: { $exists: false } })) {
  users.updateOne(
    { _id: user._id },
    { $set: { first_name: user.username, last_name: '', updated_at: new Date() } },
  );
  named += 1;
}
print('names backfilled: ' + named);

// 3. is_active, added alongside USR-10 account management.
print(
  'is_active defaulted: ' +
    users.updateMany({ is_active: { $exists: false } }, { $set: { is_active: true } })
      .modifiedCount,
);

print(
  'done. remaining legacy roles: ' + users.countDocuments({ role: { $in: ['USER', 'ADMIN'] } }),
);
