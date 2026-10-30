-- Map submission records (ADR 0003). Both tables are append-only: the triggers refuse every UPDATE, and every
-- DELETE except for a submission listed in `purges` (a submission that was not accepted, deleted when its
-- retention ends; see src/purge.js). A review decision or a takedown is a new event, never an edit. The full
-- record of each submission is also stored, locked, in the bucket at submissions/<id>/record.json;
-- receipt_sha256 is the SHA-256 of that file.

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  credit_name TEXT NOT NULL,
  title TEXT NOT NULL,
  map_filename TEXT NOT NULL,
  map_sha256 TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  agreement_sha256 TEXT NOT NULL,
  third_party_count INTEGER NOT NULL,
  missing_evidence INTEGER NOT NULL,
  receipt_json TEXT NOT NULL,
  receipt_sha256 TEXT NOT NULL
);
CREATE INDEX submissions_by_account ON submissions (discord_id, received_at);

-- One hash chain per submission, starting from its receipt_sha256:
-- hash = SHA-256 of prev_hash, a newline and the event's canonical JSON (src/records.js).
-- UNIQUE (submission_id, prev_hash) makes two writers that read the same chain end fail instead of forking it.
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL REFERENCES submissions (id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  UNIQUE (submission_id, prev_hash)
);
CREATE INDEX events_by_submission ON events (submission_id, seq);

-- Submissions deleted at the end of their retention: only the ID and the date stay, as proof of the deletion.
CREATE TABLE purges (
  submission_id TEXT PRIMARY KEY,
  purged_at TEXT NOT NULL
);

CREATE TRIGGER submissions_no_update BEFORE UPDATE ON submissions BEGIN SELECT RAISE(ABORT, 'submissions are append-only'); END;
CREATE TRIGGER submissions_no_delete BEFORE DELETE ON submissions WHEN OLD.id NOT IN (SELECT submission_id FROM purges)
  BEGIN SELECT RAISE(ABORT, 'submissions are append-only'); END;
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events WHEN OLD.submission_id NOT IN (SELECT submission_id FROM purges)
  BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER purges_no_update BEFORE UPDATE ON purges BEGIN SELECT RAISE(ABORT, 'purges are append-only'); END;
CREATE TRIGGER purges_no_delete BEFORE DELETE ON purges BEGIN SELECT RAISE(ABORT, 'purges are append-only'); END;
