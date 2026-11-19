-- Tenant schema v005 — appointment booking + session-scoped queue numbers

CREATE TABLE IF NOT EXISTS __SCHEMA__.appointment_reg_seq (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT INTO __SCHEMA__.appointment_reg_seq (name, value)
VALUES ('appointment', 0)
ON CONFLICT (name) DO NOTHING;

-- Session-scoped next queue allocator (never reuse cancelled numbers).
ALTER TABLE __SCHEMA__.consultation_sessions
  ADD COLUMN IF NOT EXISTS next_queue_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE __SCHEMA__.consultation_sessions
  DROP CONSTRAINT IF EXISTS consultation_sessions_next_queue_chk;

ALTER TABLE __SCHEMA__.consultation_sessions
  ADD CONSTRAINT consultation_sessions_next_queue_chk
  CHECK (next_queue_number >= 1);

CREATE TABLE IF NOT EXISTS __SCHEMA__.appointments (
  id UUID PRIMARY KEY,
  booking_reference TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id),
  session_id UUID NOT NULL REFERENCES __SCHEMA__.consultation_sessions(id),
  queue_number INTEGER NOT NULL,
  booking_source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  internal_notes TEXT NULL,
  cancellation_reason TEXT NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancelled_by UUID NULL,
  rescheduled_from_id UUID NULL REFERENCES __SCHEMA__.appointments(id),
  reschedule_reason TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_by UUID NULL,
  CONSTRAINT appointments_booking_reference_uidx UNIQUE (booking_reference),
  CONSTRAINT appointments_session_queue_uidx UNIQUE (session_id, queue_number),
  CONSTRAINT appointments_status_chk CHECK (
    status IN ('CONFIRMED', 'CANCELLED', 'RESCHEDULED')
  ),
  CONSTRAINT appointments_source_chk CHECK (
    booking_source IN ('PHONE', 'WALK_IN')
  ),
  CONSTRAINT appointments_queue_positive_chk CHECK (queue_number >= 1),
  CONSTRAINT appointments_version_chk CHECK (version >= 1)
);

-- One active booking per patient per session.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_patient_session_uidx
  ON __SCHEMA__.appointments (patient_id, session_id)
  WHERE status = 'CONFIRMED';

CREATE INDEX IF NOT EXISTS appointments_session_status_idx
  ON __SCHEMA__.appointments (session_id, status);

CREATE INDEX IF NOT EXISTS appointments_patient_idx
  ON __SCHEMA__.appointments (patient_id);

CREATE INDEX IF NOT EXISTS appointments_created_at_idx
  ON __SCHEMA__.appointments (created_at DESC);

CREATE INDEX IF NOT EXISTS appointments_status_idx
  ON __SCHEMA__.appointments (status);

CREATE TABLE IF NOT EXISTS __SCHEMA__.appointment_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  appointment_id UUID NOT NULL REFERENCES __SCHEMA__.appointments(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointment_idempotency_created_idx
  ON __SCHEMA__.appointment_idempotency (created_at);

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('005_appointments')
ON CONFLICT (version) DO NOTHING;
