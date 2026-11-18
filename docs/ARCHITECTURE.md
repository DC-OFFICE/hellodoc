# HelloDoc architecture decisions (ADR-001)

## Chosen stack
- npm workspaces: `apps/web` (React + TS + Vite, Tailwind 4, shadcn CLI ready)
- `apps/api` (NestJS + TS + Prisma ORM 7)
- Postgres 17 in Docker, Redis 7 placeholder for async jobs.
- HTTP `GET /api/health` verifies local connectivity.

## Tenant data strategy, NOT YET VALIDATED
- `platform` PostgreSQL schema contains SaaS tenant registry and identities.
- One `clinic_<opaque_id>` schema is proposed per dispensary for business records.
- Tenant-bound data routing MUST be server-side after authentication and membership verification.
- Static Prisma `@@schema` mappings are for named schemas at generation time; **they do not establish dynamic per-tenant routing**.
- Prisma 7 `@prisma/adapter-pg` has reported `?schema=` inconsistencies. **Do not assume changing the DB URL changes Prisma model routing.**
- App-level schema separation alone is not a security boundary. Restrict database roles/grants and protect against cross-schema SQL access.
- No code path that opens clinical tables is enabled in this starter.

## Required ADR-002 before implementation of patient records
1. Validate Prisma 7 tenant-specific client creation and schema routing against Postgres with real queries in two dynamically created schemas.
2. Prove tenant A cannot read tenant B through API and database permissions. Test forged tenant IDs and role escalation.
3. Design safe client cache + connection pooling; do not construct unlimited per-tenant pools.
4. Validate per-tenant migrations, migration versions, transactional provisioning, retries, rollback and restoration.
5. Validate onboarding lifecycle (PROVISIONING > ACTIVE > SUSPENDED > FAILED) and idempotency.
6. Define clinic data retention, export and deletion with local compliance review.

## Domains, future modules
`platform` → onboarding/subscriptions/identity/roles; `patients`; `sessions`; `appointments`; `queues`; `consultations`; `prescriptions`; `billing`; `notifications`; `audit`.

## Security baseline for future work
- Identity+MFA, server-side RBAC, user/tenant memberships, audit-sensitive actions.
- Private tracking token: hashed, high entropy, expiring, no PHI projection.
- No clinical data in logs, SMS, browser analytics, shared waiting-room boards.
- Encrypted backups and tested restore before clinical launch.

## Sources
- https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema
- https://www.prisma.io/docs/guides/v7/frameworks/nestjs
- https://github.com/prisma/orm/issues/28961
