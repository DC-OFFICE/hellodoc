-- One platform SMS gateway for every clinic. The API key columns hold sealed ciphertext only.
CREATE TABLE IF NOT EXISTS "platform"."platform_sms_gateway" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "baseUrl" TEXT NOT NULL DEFAULT 'https://smslenz.lk',
  "userId" TEXT NOT NULL DEFAULT '',
  "senderId" TEXT NOT NULL DEFAULT '',
  "connectionTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "readTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "apiKeyCiphertext" TEXT NOT NULL DEFAULT '',
  "apiKeyNonce" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" UUID,

  CONSTRAINT "platform_sms_gateway_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform"."platform_sms_gateway" (
  "id", "enabled", "baseUrl", "userId", "senderId",
  "connectionTimeoutMs", "readTimeoutMs", "apiKeyCiphertext", "apiKeyNonce", "updatedAt"
)
VALUES (
  'default', false, 'https://smslenz.lk', '', '',
  30000, 30000, '', '', CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
