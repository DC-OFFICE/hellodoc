-- Platform doctor invitations (token hash only; no clinical notes).

CREATE TABLE IF NOT EXISTS "platform"."doctor_invitations" (
  "id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "tenant_id" UUID NOT NULL,
  "doctor_profile_id" UUID NOT NULL,
  "email_normalized" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "doctor_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "doctor_invitations_token_hash_key" UNIQUE ("token_hash")
);

CREATE INDEX IF NOT EXISTS "doctor_invitations_tenant_idx"
  ON "platform"."doctor_invitations"("tenant_id", "doctor_profile_id");

ALTER TABLE "platform"."doctor_invitations"
  DROP CONSTRAINT IF EXISTS "doctor_invitations_tenant_id_fkey";
ALTER TABLE "platform"."doctor_invitations"
  ADD CONSTRAINT "doctor_invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "platform"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
