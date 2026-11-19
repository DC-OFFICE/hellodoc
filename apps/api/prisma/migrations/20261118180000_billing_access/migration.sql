-- Cashier invitations and TOTP MFA secrets (no clinical or invoice rows).

CREATE TABLE IF NOT EXISTS "platform"."staff_invitations" (
  "id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "tenant_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "email_normalized" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_invitations_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "staff_invitations_role_chk" CHECK ("role" = 'CLINIC_CASHIER')
);

CREATE INDEX IF NOT EXISTS "staff_invitations_tenant_idx"
  ON "platform"."staff_invitations"("tenant_id", "email_normalized");

ALTER TABLE "platform"."staff_invitations"
  DROP CONSTRAINT IF EXISTS "staff_invitations_tenant_id_fkey";
ALTER TABLE "platform"."staff_invitations"
  ADD CONSTRAINT "staff_invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "platform"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "platform"."user_mfa" (
  "user_id" UUID NOT NULL,
  "secret_ciphertext" TEXT NOT NULL,
  "secret_nonce" TEXT NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_mfa_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "platform"."PlatformUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "platform"."mfa_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "tenant_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_challenges_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "mfa_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "platform"."PlatformUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
