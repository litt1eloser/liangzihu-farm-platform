CREATE TABLE map_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES objects(id),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  source text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  archived_by uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((archived_at IS NULL) = (archived_by IS NULL))
);
CREATE UNIQUE INDEX map_regions_active_name ON map_regions(farm_id, lower(name)) WHERE archived_at IS NULL;
CREATE TABLE map_region_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES map_regions(id),
  object_id uuid NOT NULL REFERENCES objects(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  ended_by uuid REFERENCES users(id),
  end_reason text,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX map_region_links_one_current ON map_region_links(object_id) WHERE valid_to IS NULL;
CREATE INDEX map_region_links_region_history ON map_region_links(region_id,valid_from DESC);
