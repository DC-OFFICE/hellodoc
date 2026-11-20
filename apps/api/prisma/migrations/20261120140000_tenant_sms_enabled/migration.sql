-- AlterTable
ALTER TABLE "platform"."Tenant" ADD COLUMN IF NOT EXISTS "smsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Ensure default SMS gateway configuration has standard production defaults
UPDATE "platform"."platform_sms_gateway"
SET "baseUrl" = 'https://smslenz.lk',
    "userId" = CASE WHEN "userId" = '' THEN '1862' ELSE "userId" END,
    "senderId" = CASE WHEN "senderId" = '' THEN 'DARTCODES' ELSE "senderId" END
WHERE "id" = 'default' OR "id" = '00000000-0000-0000-0000-000000000001';
