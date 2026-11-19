-- Tenant schema v003 — doctor registration sequence + catalog references

CREATE TABLE IF NOT EXISTS __SCHEMA__.doctor_reg_seq (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT INTO __SCHEMA__.doctor_reg_seq (name, value)
VALUES ('doctor', 0)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE __SCHEMA__.doctors
  ADD COLUMN IF NOT EXISTS specialization_id UUID,
  ADD COLUMN IF NOT EXISTS qualification_id UUID,
  ADD COLUMN IF NOT EXISTS specialization_name TEXT,
  ADD COLUMN IF NOT EXISTS qualification_name TEXT;

-- Preserve legacy free-text into name columns when empty
UPDATE __SCHEMA__.doctors
SET specialization_name = COALESCE(specialization_name, NULLIF(btrim(specialization), ''))
WHERE specialization_name IS NULL;

UPDATE __SCHEMA__.doctors
SET qualification_name = COALESCE(qualification_name, NULLIF(btrim(qualifications), ''))
WHERE qualification_name IS NULL;

-- Backfill missing registration numbers
DO $$
DECLARE
  r RECORD;
  next_val INTEGER;
BEGIN
  FOR r IN
    SELECT id FROM __SCHEMA__.doctors
    WHERE registration_number IS NULL OR btrim(registration_number) = ''
    ORDER BY created_at ASC
  LOOP
    UPDATE __SCHEMA__.doctor_reg_seq
    SET value = value + 1
    WHERE name = 'doctor'
    RETURNING value INTO next_val;

    UPDATE __SCHEMA__.doctors
    SET registration_number = 'DOC-' || lpad(next_val::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE __SCHEMA__.doctors
  ALTER COLUMN registration_number SET NOT NULL;

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('003_doctor_reg_and_catalog_refs')
ON CONFLICT (version) DO NOTHING;
