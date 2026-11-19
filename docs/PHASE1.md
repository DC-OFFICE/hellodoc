# HelloDoc Phase 1 — SaaS foundation

## Routes
- `/register` — public clinic registration (pending approval)
- `/platform-admin` — DartCodes platform administrator console
- `/login` — approved clinic manager login
- `/dashboard` — shows `Welcome, [Clinic Name]`

## Local PostgreSQL (no Docker)

1. Ensure PostgreSQL is running on `localhost:5432`.
2. As a PostgreSQL administrator, run `scripts/bootstrap-local-postgres.sql`
   (create role/database, then create `platform` schema on database `hellodoc`).
3. Copy env files if needed:
   - `cp apps/api/.env.example apps/api/.env`
   - `cp apps/web/.env.example apps/web/.env`
4. Apply platform migrations and generate client:
   - `npm run db:migrate`
   - `npm run db:generate`
5. Create the first platform administrator (password is never committed):
   - `npm run create-platform-admin -- --email=admin@dartcodes.lk --name="DartCodes Admin" --password="YourStrongPass1!"`
6. Start apps: `npm run dev`

## Architecture
- Prisma manages the shared `platform` schema only.
- Approved clinics receive `clinic_<uuid32>` schemas via versioned SQL in `apps/api/tenant-migrations`.
- Clinic profile reads use schema-qualified `pg` queries with validated identifiers.
- Auth uses HttpOnly session cookies + CSRF double-submit header `x-csrf-token`.

## Remaining risks
- MFA for platform admins is not yet implemented (required before production).
- Runtime DB role still uses the app DATABASE_URL; a stricter least-privilege provisioning role split is recommended.
- Multi-clinic membership selection UI is deferred; login fails closed if more than one ACTIVE membership exists.
