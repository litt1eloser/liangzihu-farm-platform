CREATE TABLE satellite_draft_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  position geometry(Point,4326) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, request_key),
  CHECK (ST_X(position) BETWEEN -180 AND 180 AND ST_Y(position) BETWEEN -90 AND 90)
);
CREATE INDEX satellite_draft_points_owner ON satellite_draft_points(owner_id, created_at DESC);
