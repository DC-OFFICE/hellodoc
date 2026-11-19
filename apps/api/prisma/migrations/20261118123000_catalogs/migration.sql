-- CreateTable
CREATE TABLE "platform"."Specialization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."Qualification" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Specialization_nameNormalized_key" ON "platform"."Specialization"("nameNormalized");

-- CreateIndex
CREATE INDEX "Specialization_active_idx" ON "platform"."Specialization"("active");

-- CreateIndex
CREATE INDEX "Specialization_name_idx" ON "platform"."Specialization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_nameNormalized_key" ON "platform"."Qualification"("nameNormalized");

-- CreateIndex
CREATE INDEX "Qualification_active_idx" ON "platform"."Qualification"("active");

-- CreateIndex
CREATE INDEX "Qualification_name_idx" ON "platform"."Qualification"("name");
