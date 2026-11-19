-- MFA replay step, hashed recovery codes, platform MFA challenges, receptionist invitations.

ALTER TABLE "platform"."user_mfa"
  ADD COLUMN IF NOT EXISTS "last_accepted_step" BIGINT;

ALTER TABLE "platform"."mfa_challenges"
  ALTER COLUMN "tenant_id" DROP NOT NULL;

ALTER TABLE "platform"."staff_invitations"
  DROP CONSTRAINT IF EXISTS "staff_invitations_role_chk";
ALTER TABLE "platform"."staff_invitations"
  ADD CONSTRAINT "staff_invitations_role_chk"
  CHECK ("role" IN ('CLINIC_CASHIER', 'CLINIC_RECEPTIONIST'));

CREATE TABLE IF NOT EXISTS "platform"."user_mfa_recovery_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_mfa_recovery_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_mfa_recovery_codes_code_hash_key" UNIQUE ("code_hash"),
  CONSTRAINT "user_mfa_recovery_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "platform"."PlatformUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
