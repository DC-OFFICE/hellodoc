-- Tenant schema v006 — live queue entries, events, and public tracking tokens

CREATE TABLE IF NOT EXISTS __SCHEMA__.queue_entries (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL UNIQUE REFERENCES __SCHEMA__.appointments(id),
  session_id UUID NOT NULL REFERENCES __SCHEMA__.consultation_sessions(id),
  queue_number INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'RESERVED',
  checked_in_at TIMESTAMPTZ NULL,
  called_at TIMESTAMPTZ NULL,
  service_started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  skipped_at TIMESTAMPTZ NULL,
  held_at TIMESTAMPTZ NULL,
  no_show_at TIMESTAMPTZ NULL,
  skip_reason TEXT NULL,
  hold_reason TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT queue_entries_state_chk CHECK (
    state IN (
      'RESERVED', 'WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED',
      'HELD', 'SKIPPED', 'NO_SHOW', 'INVALIDATED'
    )
  ),
  CONSTRAINT queue_entries_queue_positive_chk CHECK (queue_number >= 1),
  CONSTRAINT queue_entries_version_chk CHECK (version >= 1)
);

-- Keep queue_number aligned with appointment for the same session.
CREATE UNIQUE INDEX IF NOT EXISTS queue_entries_session_queue_uidx
  ON __SCHEMA__.queue_entries (session_id, queue_number);

CREATE INDEX IF NOT EXISTS queue_entries_session_state_idx
  ON __SCHEMA__.queue_entries (session_id, state);

CREATE INDEX IF NOT EXISTS queue_entries_session_waiting_idx
  ON __SCHEMA__.queue_entries (session_id, queue_number)
  WHERE state = 'WAITING';

CREATE TABLE IF NOT EXISTS __SCHEMA__.queue_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES __SCHEMA__.consultation_sessions(id),
  queue_entry_id UUID NULL REFERENCES __SCHEMA__.queue_entries(id),
  appointment_id UUID NULL REFERENCES __SCHEMA__.appointments(id),
  event_type TEXT NOT NULL,
  actor_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS queue_events_session_id_idx
  ON __SCHEMA__.queue_events (session_id, id);

CREATE TABLE IF NOT EXISTS __SCHEMA__.appointment_tracking_tokens (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES __SCHEMA__.appointments(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS appointment_tracking_tokens_appointment_idx
  ON __SCHEMA__.appointment_tracking_tokens (appointment_id);

-- Backfill RESERVED queue entries for existing CONFIRMED appointments.
INSERT INTO __SCHEMA__.queue_entries (
  id, appointment_id, session_id, queue_number, state, version, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  a.id,
  a.session_id,
  a.queue_number,
  'RESERVED',
  1,
  NOW(),
  NOW()
FROM __SCHEMA__.appointments a
WHERE a.status = 'CONFIRMED'
  AND NOT EXISTS (
    SELECT 1 FROM __SCHEMA__.queue_entries q WHERE q.appointment_id = a.id
  );

-- Invalidate queue entries for non-active appointments.
INSERT INTO __SCHEMA__.queue_entries (
  id, appointment_id, session_id, queue_number, state, version, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  a.id,
  a.session_id,
  a.queue_number,
  'INVALIDATED',
  1,
  NOW(),
  NOW()
FROM __SCHEMA__.appointments a
WHERE a.status IN ('CANCELLED', 'RESCHEDULED')
  AND NOT EXISTS (
    SELECT 1 FROM __SCHEMA__.queue_entries q WHERE q.appointment_id = a.id
  );

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('006_live_queue')
ON CONFLICT (version) DO NOTHING;
