ALTER TABLE objects ADD COLUMN archived_at timestamptz;
ALTER TABLE objects ADD COLUMN archived_by uuid REFERENCES users(id);
ALTER TABLE objects ADD COLUMN archive_reason text;
ALTER TABLE objects ADD CONSTRAINT objects_archive_consistent CHECK (
  (archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL) OR
  (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_reason IS NOT NULL)
);
CREATE INDEX objects_active_parent ON objects(parent_id,kind) WHERE archived_at IS NULL;
