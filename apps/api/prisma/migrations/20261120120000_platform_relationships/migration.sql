-- CreateTable
CREATE TABLE IF NOT EXISTS "platform"."Relationship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Relationship_nameNormalized_key" ON "platform"."Relationship"("nameNormalized");
CREATE INDEX IF NOT EXISTS "Relationship_active_idx" ON "platform"."Relationship"("active");
CREATE INDEX IF NOT EXISTS "Relationship_name_idx" ON "platform"."Relationship"("name");

-- Seed initial relationships
INSERT INTO "platform"."Relationship" ("name", "nameNormalized", "active")
VALUES
  ('Father', 'father', true),
  ('Mother', 'mother', true),
  ('Spouse', 'spouse', true),
  ('Son', 'son', true),
  ('Daughter', 'daughter', true),
  ('Brother', 'brother', true),
  ('Sister', 'sister', true),
  ('Guardian', 'guardian', true),
  ('Grandparent', 'grandparent', true),
  ('Relative', 'relative', true),
  ('Friend', 'friend', true),
  ('Other', 'other', true)
ON CONFLICT ("nameNormalized") DO NOTHING;
