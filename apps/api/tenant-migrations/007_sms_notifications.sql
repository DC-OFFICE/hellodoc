-- Tenant schema v007 — SMS notification settings, templates, outbox, delivery events

CREATE TABLE IF NOT EXISTS __SCHEMA__.notification_settings (
  id UUID PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  booking_confirmation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cancellation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reschedule_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approaching_turn_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delay_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approaching_threshold INTEGER NOT NULL DEFAULT 3,
  approved_sender_id TEXT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NULL,
  CONSTRAINT notification_settings_threshold_chk CHECK (
    approaching_threshold >= 1 AND approaching_threshold <= 20
  )
);

INSERT INTO __SCHEMA__.notification_settings (
  id, enabled, booking_confirmation_enabled, cancellation_enabled, reschedule_enabled,
  approaching_turn_enabled, delay_alert_enabled, approaching_threshold, language
)
SELECT gen_random_uuid(), FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, 3, 'en'
WHERE NOT EXISTS (SELECT 1 FROM __SCHEMA__.notification_settings);

CREATE TABLE IF NOT EXISTS __SCHEMA__.notification_templates (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  template_body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_templates_event_chk CHECK (
    event_type IN (
      'BOOKING_CONFIRMATION',
      'CANCELLATION',
      'RESCHEDULE',
      'APPROACHING_TURN',
      'SESSION_DELAY'
    )
  ),
  CONSTRAINT notification_templates_approval_chk CHECK (
    approval_status IN ('DRAFT', 'APPROVED', 'RETIRED')
  ),
  CONSTRAINT notification_templates_event_lang_uidx UNIQUE (event_type, language, version)
);

INSERT INTO __SCHEMA__.notification_templates (id, event_type, language, template_body, version, enabled, approval_status)
SELECT gen_random_uuid(), v.event_type, 'en', v.template_body, 1, TRUE, 'APPROVED'
FROM (VALUES
  (
    'BOOKING_CONFIRMATION',
    'HelloDoc — Your appointment is confirmed. Queue Number: {{queueDisplay}}. Date: {{sessionDate}}. Track: {{trackingUrl}}. Appointment times may change.'
  ),
  (
    'CANCELLATION',
    'HelloDoc — Your appointment (Queue {{queueDisplay}}) on {{sessionDate}} has been cancelled. Please contact the clinic if you need a new booking.'
  ),
  (
    'RESCHEDULE',
    'HelloDoc — Your appointment was rescheduled. New Queue Number: {{queueDisplay}}. Date: {{sessionDate}}. Track: {{trackingUrl}}. Appointment times may change.'
  ),
  (
    'APPROACHING_TURN',
    'HelloDoc — Your turn is approaching (Queue {{queueDisplay}}). About {{peopleAhead}} patient(s) ahead. Track: {{trackingUrl}}. Timing is an estimate.'
  ),
  (
    'SESSION_DELAY',
    'HelloDoc — Your clinic session is delayed{{delayHint}}. Queue {{queueDisplay}}. Track: {{trackingUrl}}. We will update when more information is available.'
  )
) AS v(event_type, template_body)
WHERE NOT EXISTS (
  SELECT 1 FROM __SCHEMA__.notification_templates t
  WHERE t.event_type = v.event_type AND t.language = 'en' AND t.version = 1
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.notification_outbox (
  id UUID PRIMARY KEY,
  appointment_id UUID NULL REFERENCES __SCHEMA__.appointments(id),
  session_id UUID NULL REFERENCES __SCHEMA__.consultation_sessions(id),
  patient_id UUID NULL REFERENCES __SCHEMA__.patients(id),
  contact_id UUID NULL REFERENCES __SCHEMA__.patient_contacts(id),
  event_type TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  recipient_masked TEXT NOT NULL,
  recipient_e164_hash TEXT NOT NULL,
  payload_ciphertext TEXT NULL,
  payload_nonce TEXT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_until TIMESTAMPTZ NULL,
  claimed_by TEXT NULL,
  provider_message_id TEXT NULL,
  provider_name TEXT NULL,
  error_category TEXT NULL,
  error_message TEXT NULL,
  estimated_cost NUMERIC(10,4) NULL,
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ NULL,
  finalized_at TIMESTAMPTZ NULL,
  CONSTRAINT notification_outbox_event_chk CHECK (
    event_type IN (
      'BOOKING_CONFIRMATION',
      'CANCELLATION',
      'RESCHEDULE',
      'APPROACHING_TURN',
      'SESSION_DELAY'
    )
  ),
  CONSTRAINT notification_outbox_status_chk CHECK (
    status IN (
      'PENDING', 'SUBMITTED', 'DELIVERED', 'FAILED', 'UNCERTAIN', 'SKIPPED', 'CANCELLED'
    )
  ),
  CONSTRAINT notification_outbox_dedupe_uidx UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS notification_outbox_status_next_idx
  ON __SCHEMA__.notification_outbox (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS notification_outbox_appointment_idx
  ON __SCHEMA__.notification_outbox (appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_outbox_created_idx
  ON __SCHEMA__.notification_outbox (created_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.notification_delivery_events (
  id UUID PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES __SCHEMA__.notification_outbox(id) ON DELETE CASCADE,
  provider_reference TEXT NULL,
  reported_status TEXT NOT NULL,
  raw_payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_delivery_events_notification_idx
  ON __SCHEMA__.notification_delivery_events (notification_id, recorded_at DESC);

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('007_sms_notifications')
ON CONFLICT (version) DO NOTHING;
