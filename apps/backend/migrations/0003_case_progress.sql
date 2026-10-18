ALTER TABLE issues ADD COLUMN IF NOT EXISTS case_progress jsonb;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS case_revision integer NOT NULL DEFAULT 0 CHECK (case_revision >= 0);
