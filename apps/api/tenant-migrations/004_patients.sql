-- Tenant schema v004 — patient identity foundation

CREATE TABLE IF NOT EXISTS __SCHEMA__.patient_reg_seq (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT INTO __SCHEMA__.patient_reg_seq (name, value)
VALUES ('patient', 0)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS __SCHEMA__.patients (
  id UUID PRIMARY KEY,
  patient_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  preferred_name TEXT NULL,
  date_of_birth DATE NULL,
  approximate_age_years INTEGER NULL,
  age_recorded_on DATE NULL,
  sex TEXT NULL,
  address TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  contact_exception_reason TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_by UUID NULL,
  deactivated_at TIMESTAMPTZ NULL,
  deactivated_by UUID NULL,
  deactivation_reason TEXT NULL,
  CONSTRAINT patients_patient_number_uidx UNIQUE (patient_number),
  CONSTRAINT patients_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT patients_sex_chk CHECK (
    sex IS NULL OR sex IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN')
  ),
  CONSTRAINT patients_name_chk CHECK (char_length(btrim(full_name)) >= 2),
  CONSTRAINT patients_age_chk CHECK (
    approximate_age_years IS NULL
    OR (approximate_age_years >= 0 AND approximate_age_years <= 130)
  ),
  CONSTRAINT patients_age_recorded_chk CHECK (
    (approximate_age_years IS NULL AND age_recorded_on IS NULL)
    OR (approximate_age_years IS NOT NULL AND age_recorded_on IS NOT NULL)
  ),
  CONSTRAINT patients_dob_or_age_chk CHECK (
    NOT (
      date_of_birth IS NOT NULL
      AND approximate_age_years IS NOT NULL
    )
  ),
  CONSTRAINT patients_contact_or_exception_chk CHECK (
    contact_exception_reason IS NULL
    OR char_length(btrim(contact_exception_reason)) >= 3
  ),
  CONSTRAINT patients_version_chk CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS patients_status_idx
  ON __SCHEMA__.patients (status);

CREATE INDEX IF NOT EXISTS patients_full_name_lower_idx
  ON __SCHEMA__.patients (lower(full_name));

CREATE INDEX IF NOT EXISTS patients_created_at_idx
  ON __SCHEMA__.patients (created_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.patient_contacts (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL,
  display_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  contact_person_name TEXT NULL,
  relationship TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_contacts_type_chk CHECK (
    contact_type IN ('MOBILE', 'LANDLINE', 'GUARDIAN_MOBILE', 'OTHER')
  ),
  CONSTRAINT patient_contacts_display_chk CHECK (char_length(btrim(display_value)) >= 3),
  CONSTRAINT patient_contacts_normalized_chk CHECK (char_length(btrim(normalized_value)) >= 3)
);

CREATE INDEX IF NOT EXISTS patient_contacts_patient_idx
  ON __SCHEMA__.patient_contacts (patient_id);

CREATE INDEX IF NOT EXISTS patient_contacts_normalized_idx
  ON __SCHEMA__.patient_contacts (normalized_value);

CREATE INDEX IF NOT EXISTS patient_contacts_primary_idx
  ON __SCHEMA__.patient_contacts (patient_id, is_primary)
  WHERE is_primary = TRUE;

-- Phone numbers are intentionally NOT unique across patients (family sharing).

CREATE TABLE IF NOT EXISTS __SCHEMA__.patient_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('004_patients')
ON CONFLICT (version) DO NOTHING;
