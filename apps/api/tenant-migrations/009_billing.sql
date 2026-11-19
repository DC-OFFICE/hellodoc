-- Tenant schema v009 — invoices, payments, refunds, credit notes.
-- Monetary columns are NUMERIC. No card numbers. No clinical notes.

CREATE TABLE IF NOT EXISTS __SCHEMA__.billing_sequences (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  invoice_seq BIGINT NOT NULL DEFAULT 0,
  receipt_seq BIGINT NOT NULL DEFAULT 0,
  payment_seq BIGINT NOT NULL DEFAULT 0,
  credit_seq BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT billing_sequences_singleton CHECK (id)
);

INSERT INTO __SCHEMA__.billing_sequences (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS __SCHEMA__.billing_services (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  price NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LKR',
  tax_classification TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  CONSTRAINT billing_services_code_unique UNIQUE (code),
  CONSTRAINT billing_services_price_chk CHECK (price >= 0),
  CONSTRAINT billing_services_currency_chk CHECK (currency = 'LKR'),
  CONSTRAINT billing_services_tax_chk CHECK (tax_classification IN ('UNCLASSIFIED', 'TAXABLE', 'EXEMPT'))
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  display_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'LKR',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  receipt_prefix TEXT NOT NULL DEFAULT 'RCT',
  payment_prefix TEXT NOT NULL DEFAULT 'PAY',
  credit_prefix TEXT NOT NULL DEFAULT 'CN',
  default_service_id UUID NULL,
  allowed_methods TEXT[] NOT NULL DEFAULT ARRAY['CASH', 'CARD_EXTERNAL', 'BANK_TRANSFER'],
  cashier_may_discount BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_footer TEXT NOT NULL DEFAULT '',
  tax_registered BOOLEAN NOT NULL DEFAULT FALSE,
  tax_registration_no TEXT NULL,
  vat_rate NUMERIC(5,2) NULL,
  document_mode TEXT NOT NULL DEFAULT 'ORDINARY_RECEIPT',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NULL,
  CONSTRAINT billing_settings_singleton CHECK (id),
  CONSTRAINT billing_settings_currency_chk CHECK (currency = 'LKR'),
  CONSTRAINT billing_settings_vat_chk CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100)),
  CONSTRAINT billing_settings_mode_chk CHECK (document_mode IN ('ORDINARY_RECEIPT', 'VAT_TAX_INVOICE'))
);

INSERT INTO __SCHEMA__.billing_settings (id, display_name)
SELECT TRUE, COALESCE((SELECT clinic_name FROM __SCHEMA__.clinic_profile LIMIT 1), '')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS __SCHEMA__.invoices (
  id UUID PRIMARY KEY,
  invoice_number TEXT NULL,
  appointment_id UUID NULL REFERENCES __SCHEMA__.appointments(id),
  patient_id UUID NOT NULL REFERENCES __SCHEMA__.patients(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'LKR',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  invoice_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  clinic_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NULL,
  voided_at TIMESTAMPTZ NULL,
  void_reason TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  issued_by UUID NULL,
  voided_by UUID NULL,
  CONSTRAINT invoices_status_chk CHECK (status IN ('DRAFT', 'ISSUED', 'VOIDED')),
  CONSTRAINT invoices_currency_chk CHECK (currency = 'LKR'),
  CONSTRAINT invoices_money_chk CHECK (
    subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND invoice_total >= 0
  ),
  CONSTRAINT invoices_number_unique UNIQUE (invoice_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_open_per_appointment
  ON __SCHEMA__.invoices (appointment_id)
  WHERE appointment_id IS NOT NULL AND status <> 'VOIDED';

CREATE TABLE IF NOT EXISTS __SCHEMA__.invoice_items (
  id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES __SCHEMA__.invoices(id) ON DELETE CASCADE,
  service_id UUID NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_classification TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  tax_rate NUMERIC(5,2) NULL,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL,
  position INTEGER NOT NULL,
  CONSTRAINT invoice_items_qty_chk CHECK (quantity >= 1 AND quantity <= 99),
  CONSTRAINT invoice_items_money_chk CHECK (
    unit_price >= 0 AND discount >= 0 AND tax_amount >= 0 AND line_total >= 0
  )
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.payments (
  id UUID PRIMARY KEY,
  payment_reference TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES __SCHEMA__.invoices(id),
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LKR',
  method TEXT NOT NULL,
  external_reference TEXT NULL,
  status TEXT NOT NULL DEFAULT 'RECORDED',
  idempotency_key TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID NOT NULL,
  CONSTRAINT payments_amount_chk CHECK (amount > 0),
  CONSTRAINT payments_currency_chk CHECK (currency = 'LKR'),
  CONSTRAINT payments_method_chk CHECK (method IN ('CASH', 'CARD_EXTERNAL', 'BANK_TRANSFER')),
  CONSTRAINT payments_status_chk CHECK (status = 'RECORDED'),
  CONSTRAINT payments_reference_unique UNIQUE (payment_reference),
  CONSTRAINT payments_receipt_unique UNIQUE (receipt_number),
  CONSTRAINT payments_idempotency_unique UNIQUE (invoice_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.payment_refunds (
  id UUID PRIMARY KEY,
  refund_reference TEXT NOT NULL,
  payment_id UUID NOT NULL REFERENCES __SCHEMA__.payments(id),
  amount NUMERIC(14,2) NOT NULL,
  method TEXT NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  recorded_by UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_refunds_amount_chk CHECK (amount > 0),
  CONSTRAINT payment_refunds_method_chk CHECK (method IN ('CASH', 'CARD_EXTERNAL', 'BANK_TRANSFER')),
  CONSTRAINT payment_refunds_reference_unique UNIQUE (refund_reference),
  CONSTRAINT payment_refunds_idempotency_unique UNIQUE (payment_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.invoice_credit_notes (
  id UUID PRIMARY KEY,
  credit_number TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES __SCHEMA__.invoices(id),
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  issued_by UUID NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_credit_notes_amount_chk CHECK (amount > 0),
  CONSTRAINT invoice_credit_notes_number_unique UNIQUE (credit_number),
  CONSTRAINT invoice_credit_notes_idempotency_unique UNIQUE (invoice_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.billing_audit_events (
  id UUID PRIMARY KEY,
  actor_id UUID NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_audit_events_entity_idx
  ON __SCHEMA__.billing_audit_events (entity_type, entity_id, created_at);

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('009_billing')
ON CONFLICT (version) DO NOTHING;
