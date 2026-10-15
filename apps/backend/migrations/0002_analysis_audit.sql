ALTER TABLE issues ADD COLUMN IF NOT EXISTS analysis_input jsonb;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS analysis_input jsonb;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz NOT NULL DEFAULT now();
