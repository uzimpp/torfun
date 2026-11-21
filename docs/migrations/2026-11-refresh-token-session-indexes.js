// Indexes for session management (issue #170). Idempotent: createIndex is a no-op when the index exists.
//
//   mongosh "$MONGODB_URI" --file docs/migrations/2026-11-refresh-token-session-indexes.js
//
// `requireAuth` asks "is this session's refresh family still live?" on every authenticated
// request, so family_id must be indexed. The TTL index sweeps expired rows.
const tokens = db.getCollection('refresh_tokens');
tokens.createIndex({ family_id: 1, revoked_at: 1, expires_at: 1 });
tokens.createIndex({ user_id: 1, revoked_at: 1 });
tokens.createIndex({ token_hash: 1 }, { unique: true });
tokens.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
