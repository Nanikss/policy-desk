CREATE TABLE IF NOT EXISTS policies (
  id          UUID PRIMARY KEY,
  status      TEXT NOT NULL CHECK (status IN ('QUOTED', 'IN_FORCE', 'CANCELLED')),
  doc         JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policies_status_idx ON policies (status);
CREATE INDEX IF NOT EXISTS policies_updated_at_idx ON policies (updated_at DESC);
