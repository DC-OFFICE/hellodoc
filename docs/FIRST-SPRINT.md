# HelloDoc — First sprint (foundation)

## 1. Gate: local setup
- [ ] Install Node.js 22.22.3+ (or current supported 24 LTS), npm and Docker.
- [ ] `cp apps/api/.env.example apps/api/.env`
- [ ] `cp apps/web/.env.example apps/web/.env`
- [ ] `npm install` and commit generated package-lock.json.
- [ ] `npm run db:up`.
- [ ] `npm run db:migrate` (migration development / creates `platform` schema).
- [ ] `npm run db:generate`.
- [ ] `npm run dev`.
- [ ] View `http://localhost:5173`, and `http://localhost:4000/api/health`.
- [ ] `npm run typecheck` / `npm run build` succeed.

## 2. Gate: tenancy POC
- [ ] `npm run db:poc` creates two local schemas and confirms distinct data.
- [ ] Add test DB roles with no cross-schema access; POC alone is not secure isolation.
- [ ] Test Prisma tenant client / adapter routing against both schemas.
- [ ] Test migration deployment against a newly provisioned and an older tenant.
- [ ] Document which tenant Prisma strategy is actually supported and pin versions.

## 3. Gate: minimum platform admin
- [ ] Authentication with password hashes and MFA for privileged users.
- [ ] Platform-admin authorization; do not ship unauthenticated provisioning endpoints.
- [ ] Tenant registry with unique IDs, status, stable schemaName and provisioning logs.
- [ ] Provisioning service with retries, idempotency and audit.
- [ ] Clinic-manager invitation and tenant membership.
- [ ] Cross-tenant denial tests (API and DB).

## 4. Gate: first functional slice
- [ ] Patient directory (no real data until tenancy security gate passes).
- [ ] Doctor/session setup.
- [ ] Booking with atomic numbering and capacity check.
- [ ] Restricted patient tracking and queue state transitions.

## Exclusions
No login or real tenant provisioning is implemented in this scaffold. No clinic should be onboarded and no real patient data should be entered yet.
