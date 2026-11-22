// mongosh "$MONGODB_URI" --file docs/migrations/notification-alert-state.js
// Idempotent notification metadata repair; never changes procurement evidence.
// The repository also repairs each legacy observation transactionally on read,
// so application deployment does not depend on running this migration first.
const { createHash } = require('node:crypto');
const key = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const session = db.getMongo().startSession();
try {
  for (const candidate of db.notification_observations.find(
    { match_notified_at: { $exists: false } },
    { _id: 1 },
  )) {
    session.withTransaction(async () => {
      const scoped = session.getDatabase(db.getName());
      const observation = await scoped.notification_observations.findOne({
        _id: candidate._id,
        match_notified_at: { $exists: false },
      });
      if (!observation) return;
      const candidates = await scoped.notifications
        .find({
          _id: {
            $in: [
              key(observation._id, 'match_found', 'initial'),
              key(observation._id, 'new_open', 'initial'),
            ],
          },
        })
        .toArray();
      const alerts = [];
      for (const alert of candidates) {
        const recorded =
          alert.in_app ||
          (await scoped.notification_deliveries.findOne({
            _id: { $in: [key(alert._id, 'email'), key(alert._id, 'line')] },
          }));
        if (recorded) alerts.push(alert);
        else await scoped.notifications.deleteOne({ _id: alert._id });
      }
      const match = alerts.find((alert) => alert.event === 'match_found');
      const opened = alerts.find((alert) => alert.event === 'new_open');
      await scoped.notification_observations.updateOne(
        { _id: observation._id },
        {
          $set: {
            match_notified_at: match?.created_at ?? null,
            opened_at: match?.created_at ?? opened?.created_at ?? null,
          },
        },
      );
    });
  }
} finally {
  session.endSession();
}
