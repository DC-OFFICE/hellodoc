-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateTable
CREATE TABLE "platform"."PlatformUser" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."PlatformAdmin" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."Tenant" (
    "id" UUID NOT NULL,
    "clinicName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "registrationStatus" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "provisioningStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "status" TEXT NOT NULL DEFAULT 'PROVISIONING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."TenantMembership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."ClinicRegistration" (
    "id" UUID NOT NULL,
    "clinicName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "applicantUserId" UUID,
    "tenantId" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."ProvisioningRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "schemaName" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "migrationVersion" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProvisioningRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "activeTenantId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgentHash" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "platform"."PlatformUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_emailNormalized_key" ON "platform"."PlatformUser"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "platform"."PlatformAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "platform"."Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_schemaName_key" ON "platform"."Tenant"("schemaName");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "platform"."Tenant"("status");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "platform"."TenantMembership"("userId");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_idx" ON "platform"."TenantMembership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_role_key" ON "platform"."TenantMembership"("tenantId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicRegistration_tenantId_key" ON "platform"."ClinicRegistration"("tenantId");

-- CreateIndex
CREATE INDEX "ClinicRegistration_status_idx" ON "platform"."ClinicRegistration"("status");

-- CreateIndex
CREATE INDEX "ClinicRegistration_emailNormalized_idx" ON "platform"."ClinicRegistration"("emailNormalized");

-- CreateIndex
CREATE INDEX "ProvisioningRecord_tenantId_idx" ON "platform"."ProvisioningRecord"("tenantId");

-- CreateIndex
CREATE INDEX "ProvisioningRecord_state_idx" ON "platform"."ProvisioningRecord"("state");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "platform"."AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "platform"."AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "platform"."AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "platform"."AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "platform"."AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "platform"."PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform"."PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform"."PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."ClinicRegistration" ADD CONSTRAINT "ClinicRegistration_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "platform"."PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."ClinicRegistration" ADD CONSTRAINT "ClinicRegistration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "platform"."PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."ClinicRegistration" ADD CONSTRAINT "ClinicRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."ProvisioningRecord" ADD CONSTRAINT "ProvisioningRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "platform"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform"."PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "platform"."PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
