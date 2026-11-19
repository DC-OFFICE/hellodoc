-- Platform routing index for public tracking tokens (no patient PII).
CREATE TABLE IF NOT EXISTS "platform"."tracking_token_index" (
  "token_hash" TEXT NOT NULL,
  "tenant_id" UUID NOT NULL,
  "tenant_token_reference" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tracking_token_index_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX IF NOT EXISTS "tracking_token_index_tenant_id_idx"
  ON "platform"."tracking_token_index"("tenant_id");

CREATE INDEX IF NOT EXISTS "tracking_token_index_expires_at_idx"
  ON "platform"."tracking_token_index"("expires_at");

ALTER TABLE "platform"."tracking_token_index"
  DROP CONSTRAINT IF EXISTS "tracking_token_index_tenant_id_fkey";
ALTER TABLE "platform"."tracking_token_index"
  ADD CONSTRAINT "tracking_token_index_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "platform"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Minimal cross-tenant SMS dispatch claim index (no message body / phone).
CREATE TABLE IF NOT EXISTS "platform"."sms_dispatch_index" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "tenant_outbox_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_until" TIMESTAMP(3),
  "claimed_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_dispatch_index_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_dispatch_index_tenant_outbox_uidx" UNIQUE ("tenant_id", "tenant_outbox_id"),
  CONSTRAINT "sms_dispatch_index_status_chk" CHECK (
    "status" IN ('PENDING','SUBMITTED','DELIVERED','FAILED','UNCERTAIN','SKIPPED','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS "sms_dispatch_index_claim_idx"
  ON "platform"."sms_dispatch_index"("status", "next_attempt_at");

ALTER TABLE "platform"."sms_dispatch_index"
  DROP CONSTRAINT IF EXISTS "sms_dispatch_index_tenant_id_fkey";
ALTER TABLE "platform"."sms_dispatch_index"
  ADD CONSTRAINT "sms_dispatch_index_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "platform"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
