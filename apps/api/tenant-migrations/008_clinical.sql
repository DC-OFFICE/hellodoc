-- Tenant schema v008 — doctor account links and clinical records

ALTER TABLE __SCHEMA__.doctors
  ADD COLUMN IF NOT EXISTS credential_review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW';

ALTER TABLE __SCHEMA__.doctors
  DROP CONSTRAINT IF EXISTS doctors_credential_review_chk;
ALTER TABLE __SCHEMA__.doctors
  ADD CONSTRAINT doctors_credential_review_chk CHECK (
    credential_review_status IN ('PENDING_REVIEW', 'VERIFIED', 'SUSPENDED')
  );

CREATE TABLE IF NOT EXISTS __SCHEMA__.doctor_user_links (
  id UUID PRIMARY KEY,
  doctor_id UUID NOT NULL UNIQUE REFERENCES __SCHEMA__.doctors(id),
  user_id UUID NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.patient_allergy_status (
  patient_id UUID PRIMARY KEY REFERENCES __SCHEMA__.patients(id),
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  confirmed_by UUID NULL,
  confirmed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_allergy_status_chk CHECK (
    status IN ('UNKNOWN', 'ALLERGIES_RECORDED', 'NO_KNOWN_ALLERGIES')
  )
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.patient_allergies (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id),
  substance TEXT NOT NULL,
  reaction TEXT NULL,
  severity TEXT NULL,
  information_source TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  recorded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_allergies_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT patient_allergies_severity_chk CHECK (
    severity IS NULL OR severity IN ('MILD', 'MODERATE', 'SEVERE', 'UNKNOWN')
  )
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.patient_medical_history (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id),
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  recorded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_history_category_chk CHECK (
    category IN ('CONDITION', 'PROCEDURE', 'LONG_TERM_TREATMENT', 'BACKGROUND')
  )
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.clinical_encounters (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL UNIQUE REFERENCES __SCHEMA__.appointments(id),
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id),
  doctor_id UUID NOT NULL REFERENCES __SCHEMA__.doctors(id),
  session_id UUID NOT NULL REFERENCES __SCHEMA__.consultation_sessions(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  chief_complaint TEXT NULL,
  history_present_illness TEXT NULL,
  examination_findings TEXT NULL,
  assessment TEXT NULL,
  treatment_plan TEXT NULL,
  follow_up_instructions TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  updated_by UUID NULL,
  signed_by UUID NULL,
  signed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinical_encounters_status_chk CHECK (
    status IN ('DRAFT', 'SIGNED', 'ENTERED_IN_ERROR')
  ),
  CONSTRAINT clinical_encounters_version_chk CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS clinical_encounters_doctor_idx
  ON __SCHEMA__.clinical_encounters (doctor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.encounter_vitals (
  id UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES __SCHEMA__.clinical_encounters(id),
  systolic_mmhg INTEGER NULL,
  diastolic_mmhg INTEGER NULL,
  pulse_bpm INTEGER NULL,
  temperature_c NUMERIC(4,1) NULL,
  weight_kg NUMERIC(5,2) NULL,
  height_cm NUMERIC(5,1) NULL,
  spo2_percent INTEGER NULL,
  respiratory_rate INTEGER NULL,
  recorded_by UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT encounter_vitals_ranges_chk CHECK (
    (systolic_mmhg IS NULL OR (systolic_mmhg BETWEEN 40 AND 300))
    AND (diastolic_mmhg IS NULL OR (diastolic_mmhg BETWEEN 20 AND 200))
    AND (pulse_bpm IS NULL OR (pulse_bpm BETWEEN 20 AND 300))
    AND (temperature_c IS NULL OR (temperature_c BETWEEN 30 AND 45))
    AND (weight_kg IS NULL OR (weight_kg BETWEEN 0.5 AND 400))
    AND (height_cm IS NULL OR (height_cm BETWEEN 20 AND 260))
    AND (spo2_percent IS NULL OR (spo2_percent BETWEEN 50 AND 100))
    AND (respiratory_rate IS NULL OR (respiratory_rate BETWEEN 4 AND 80))
  )
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.clinical_addenda (
  id UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES __SCHEMA__.clinical_encounters(id),
  body TEXT NOT NULL,
  reason TEXT NOT NULL,
  author_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.prescriptions (
  id UUID PRIMARY KEY,
  encounter_id UUID NOT NULL REFERENCES __SCHEMA__.clinical_encounters(id),
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id),
  doctor_id UUID NOT NULL REFERENCES __SCHEMA__.doctors(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  clinical_instructions TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID NULL REFERENCES __SCHEMA__.prescriptions(id),
  void_reason TEXT NULL,
  created_by UUID NOT NULL,
  signed_by UUID NULL,
  signed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prescriptions_status_chk CHECK (
    status IN ('DRAFT', 'SIGNED', 'VOIDED', 'SUPERSEDED')
  )
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.prescription_items (
  id UUID PRIMARY KEY,
  prescription_id UUID NOT NULL REFERENCES __SCHEMA__.prescriptions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  medicine_name TEXT NOT NULL,
  strength TEXT NULL,
  dosage_form TEXT NULL,
  dose TEXT NOT NULL,
  route TEXT NULL,
  frequency TEXT NOT NULL,
  duration TEXT NULL,
  quantity TEXT NULL,
  instructions TEXT NULL
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.clinical_audit_events (
  id UUID PRIMARY KEY,
  actor_id UUID NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clinical_audit_events_entity_idx
  ON __SCHEMA__.clinical_audit_events (entity_type, entity_id, created_at);

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('008_clinical')
ON CONFLICT (version) DO NOTHING;
