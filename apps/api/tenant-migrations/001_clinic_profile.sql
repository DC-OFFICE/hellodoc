-- Tenant schema baseline v001
-- Placeholders: __SCHEMA__ is replaced with a validated quoted identifier by the provisioner.
CREATE TABLE IF NOT EXISTS __SCHEMA__.clinic_profile (
  id UUID PRIMARY KEY,
  platform_tenant_id UUID NOT NULL UNIQUE,
  clinic_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.schema_migration (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO __SCHEMA__.schema_migration (version)
VALUES ('001_clinic_profile')
ON CONFLICT (version) DO NOTHING;
