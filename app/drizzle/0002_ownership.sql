ALTER TABLE records ADD COLUMN owner_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE history ADD COLUMN owner_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE completions ADD COLUMN owner_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE;
--> statement-breakpoint
DROP INDEX record_occurrence;
--> statement-breakpoint
CREATE UNIQUE INDEX record_owner_occurrence ON records(owner_id,occurrence);
--> statement-breakpoint
CREATE INDEX records_owner ON records(owner_id);
--> statement-breakpoint
CREATE INDEX history_owner ON history(owner_id);
--> statement-breakpoint
CREATE INDEX completions_owner ON completions(owner_id);
--> statement-breakpoint
ALTER TABLE requests RENAME TO legacy_requests;
--> statement-breakpoint
CREATE TABLE requests (
 id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 result TEXT NOT NULL,
 created_at TEXT NOT NULL,
 owner_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE,
 PRIMARY KEY(owner_id,id)
);
--> statement-breakpoint
INSERT INTO requests(id,fingerprint,result,created_at,owner_id) SELECT id,fingerprint,result,created_at,NULL FROM legacy_requests;
--> statement-breakpoint
DROP TABLE legacy_requests;
--> statement-breakpoint
CREATE TABLE ownership_claims (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
 claimed_at TEXT NOT NULL
);
