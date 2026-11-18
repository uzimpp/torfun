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

const companies = db.getCollection('companies');
const users = db.getCollection('users');

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
