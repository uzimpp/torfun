// Company Managers and join requests (pentest finding P-1, issue #200). Idempotent.
//
//   mongosh "$MONGODB_URI" --file docs/migrations/2026-11-company-managers.js
//
// Joining a Company used to be one click with no approval. Now a Company Manager approves
// each request. Companies created before this change have no manager, so this script gives
// each one a manager: the member whose account is oldest (the best stand-in we have for
// "who created it", which was never recorded). Automatic approval starts off everywhere.
// A Company with no members keeps an empty list; whoever creates or is approved into it
// next is handled by the API, and a Site Administrator can assign a manager with
// POST /api/admin/companies/:id/managers.
//
// Run it once before deploying the API that enforces approval, or nobody can approve joins
// for existing Companies until an administrator assigns managers.
//
// It also drops manager ids whose account no longer belongs to that Company (left, moved,
// removed, made an administrator, or deleted). Earlier builds of this branch left them
// behind, and such an id made its owner a manager again on rejoining (#204, R-04). This
// runs first, so a Company left with no real manager is then given one like any other.
// Safe to re-run: a clean list is left as it is.

const companies = db.getCollection('companies');
const users = db.getCollection('users');

let stale = 0;
companies.find({ 'manager_ids.0': { $exists: true } }).forEach((company) => {
  const members = new Set(
    users
      .find(
        {
          _id: { $in: company.manager_ids.filter(ObjectId.isValid).map((id) => new ObjectId(id)) },
        },
        { _id: 1, company_id: 1 },
      )
      .toArray()
      .filter((user) => user.company_id === company._id.toString())
      .map((user) => user._id.toString()),
  );
  const gone = company.manager_ids.filter((id) => !members.has(id));
  if (gone.length === 0) return;
  companies.updateOne({ _id: company._id }, { $pull: { manager_ids: { $in: gone } } });
  stale += gone.length;
});
print(`stale company manager ids removed: ${stale}`);

let assigned = 0;
companies
  .find({ $or: [{ manager_ids: { $exists: false } }, { manager_ids: { $size: 0 } }] })
  .forEach((company) => {
    const oldest = users
      .find({ company_id: company._id.toString(), is_active: { $ne: false } })
      .sort({ created_at: 1, _id: 1 })
      .limit(1)
      .toArray()[0];
    companies.updateOne(
      { _id: company._id },
      {
        $set: {
          manager_ids: oldest ? [oldest._id.toString()] : [],
          auto_approve_domain: company.auto_approve_domain ?? null,
        },
      },
    );
    if (oldest) assigned += 1;
  });
print(`company managers assigned: ${assigned}`);

// The member list and the request queue both look users up by Company.
users.createIndex({ company_id: 1, created_at: 1 });
users.createIndex(
  { 'join_request.company_id': 1, 'join_request.requested_at': 1 },
  { sparse: true },
);
