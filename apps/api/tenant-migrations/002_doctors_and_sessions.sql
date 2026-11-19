-- Tenant schema v002 — doctors, weekly templates, consultation sessions
-- Placeholder __SCHEMA__ is replaced with a validated quoted identifier.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS __SCHEMA__.doctors (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  registration_number TEXT,
  qualifications TEXT,
  specialization TEXT,
  contact_number TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_by UUID,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS doctors_registration_number_uidx
  ON __SCHEMA__.doctors (lower(registration_number))
  WHERE registration_number IS NOT NULL AND btrim(registration_number) <> '';

CREATE INDEX IF NOT EXISTS doctors_status_idx ON __SCHEMA__.doctors (status);
CREATE INDEX IF NOT EXISTS doctors_display_name_idx ON __SCHEMA__.doctors (lower(display_name));

CREATE TABLE IF NOT EXISTS __SCHEMA__.schedule_templates (
  id UUID PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES __SCHEMA__.doctors(id),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  local_start_time TIME NOT NULL,
  local_end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE,
  default_capacity INTEGER NOT NULL DEFAULT 20 CHECK (default_capacity > 0 AND default_capacity <= 500),
  expected_duration_minutes INTEGER NOT NULL DEFAULT 10 CHECK (expected_duration_minutes > 0 AND expected_duration_minutes <= 240),
  timezone TEXT NOT NULL DEFAULT 'Asia/Colombo',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_by UUID,
  CHECK (local_end_time > local_start_time),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS schedule_templates_doctor_idx
  ON __SCHEMA__.schedule_templates (doctor_id, is_active);

CREATE TABLE IF NOT EXISTS __SCHEMA__.consultation_sessions (
  id UUID PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES __SCHEMA__.doctors(id),
  local_date DATE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Colombo',
  capacity INTEGER NOT NULL CHECK (capacity > 0 AND capacity <= 500),
  expected_duration_minutes INTEGER NOT NULL CHECK (expected_duration_minutes > 0 AND expected_duration_minutes <= 240),
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'OPEN', 'PAUSED', 'DELAYED', 'CLOSED', 'CANCELLED')),
  location TEXT,
  internal_notes TEXT,
  schedule_template_id UUID REFERENCES __SCHEMA__.schedule_templates(id),
  occurrence_key TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_by UUID,
  CHECK (end_at > start_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS consultation_sessions_occurrence_uidx
  ON __SCHEMA__.consultation_sessions (occurrence_key)
  WHERE occurrence_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultation_sessions_doctor_start_idx
  ON __SCHEMA__.consultation_sessions (doctor_id, start_at);

CREATE INDEX IF NOT EXISTS consultation_sessions_local_date_idx
  ON __SCHEMA__.consultation_sessions (local_date);

CREATE INDEX IF NOT EXISTS consultation_sessions_status_idx
  ON __SCHEMA__.consultation_sessions (status);

-- Half-open overlap prevention [start, end); CANCELLED sessions do not block.
-- Applied once via schema_migration version tracking.
ALTER TABLE __SCHEMA__.consultation_sessions
  DROP CONSTRAINT IF EXISTS consultation_sessions_no_overlap;

ALTER TABLE __SCHEMA__.consultation_sessions
  ADD CONSTRAINT consultation_sessions_no_overlap
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status <> 'CANCELLED');

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('002_doctors_and_sessions')
ON CONFLICT (version) DO NOTHING;
