// One Company per TIN. Idempotent.
//
//   mongosh "$MONGODB_URI" --file docs/migrations/2026-11-company-unique-tin.js
//
// A Company used to be creatable with no TIN, and the same TIN could be registered any number
// of times, so two colleagues who both typed "บริษัท เทสโค จำกัด" got two records. The API now
// requires a 13-digit TIN to create a Company and refuses one that is already taken, and the
// `tin_unique` index (partial: only documents whose `tin` is a string) backs that up.
//
// This script does not merge anything. Merging two Companies means moving their members,
// clients and experiences, which is a decision about whose record survives. It:
//   1. prints every TIN held by more than one Company, with the ids, names and member counts,
//   2. prints how many Companies have no TIN (they keep working; a manager can add one via
//      PATCH /api/companies/me),
//   3. creates the unique index only when step 1 found nothing. Until then the API still
//      refuses new duplicates, because the service checks before it writes.
//
// Merge the duplicates it lists (point `users.company_id`, `clients.company_id` and
// `experiences.company_id` at the surviving Company, then delete the other), and run it again.

const companies = db.getCollection('companies');
const users = db.getCollection('users');

const duplicates = companies
  .aggregate([
    { $match: { tin: { $type: 'string' } } },
    {
      $group: { _id: '$tin', ids: { $push: '$_id' }, names: { $push: '$name_th' }, n: { $sum: 1 } },
    },
    { $match: { n: { $gt: 1 } } },
  ])
  .toArray();

duplicates.forEach((group) => {
  print(`TIN ${group._id} is held by ${group.n} Companies:`);
  group.ids.forEach((id, i) => {
    print(
      `  ${id}  ${group.names[i]}  members: ${users.countDocuments({ company_id: id.toString() })}`,
    );
  });
});

print(
  `Companies without a TIN: ${companies.countDocuments({ tin: { $not: { $type: 'string' } } })}`,
);

if (duplicates.length === 0) {
  companies.createIndex(
    { tin: 1 },
    { unique: true, partialFilterExpression: { tin: { $type: 'string' } }, name: 'tin_unique' },
  );
  print('tin_unique index is in place.');
} else {
  print(
    `${duplicates.length} duplicated TIN(s): merge them, then run this again to create the index.`,
  );
}
