/**
 * The one collection that holds this system's small singleton documents about
 * ingestion — the last run, the run lease and the Schedule — each under its own
 * `_id`. Named once so the three repositories that share it cannot drift apart.
 */
export const INGESTION_META_COLLECTION = 'ingestion_meta';
