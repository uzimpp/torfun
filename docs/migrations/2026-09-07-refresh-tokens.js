// Indexes for the refresh_tokens collection introduced with token rotation.
//
//   docker compose up -d mongodb
//   mongosh "$MONGODB_URI" docs/migrations/2026-09-07-refresh-tokens.js
//
// Idempotent: createIndex is a no-op when an identical index already exists.

const tokens = db.getCollection('refresh_tokens');

// 1. Lookup key. Every refresh is a findOne on this digest, and two tokens can
//    never share one, so it doubles as the collision guard.
print('token_hash: ' + tokens.createIndex({ token_hash: 1 }, { unique: true }));

// 2. Reuse detection retires a whole chain at once; without this it would be a
//    collection scan on every compromised token.
print('family_id: ' + tokens.createIndex({ family_id: 1 }));

// 3. TTL sweep. Rows are marked revoked rather than deleted so a replayed
//    token is still recognisable, but once a row is past its own expiry it can
//    no longer be exchanged either way, so Mongo may reap it.
print('expires_at TTL: ' + tokens.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }));

print('done. tokens stored: ' + tokens.countDocuments({}));
