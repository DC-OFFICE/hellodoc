# HelloDoc — SaaS (DartCodes Pvt Ltd)

**Status: Phase 1 SaaS foundation. NOT production ready; do not enter real patient data.**

Multi-tenant clinic/dispensary management SaaS. Phase 1 delivers clinic registration, platform-admin approval, per-clinic PostgreSQL schema provisioning, clinic login, and a protected dashboard that shows the authenticated clinic name.

## Stack
- **Web**: React 19, TypeScript, Vite, Tailwind CSS 4, React Router, React Hook Form, Zod
- **API**: NestJS 11, Prisma ORM 7 (platform registry), `pg` for tenant schema provisioning
- **Database**: PostgreSQL 16+ local (Docker optional / not required)
- **Structure**: npm workspaces (`apps/web`, `apps/api`)

## Requirements
- Node.js **22.22.3+**
- Local PostgreSQL on `localhost:5432`
- npm

## Quick start (no Docker)

```bash
# 1) As a PostgreSQL administrator, bootstrap role/db/schema:
#    scripts/bootstrap-local-postgres.sql

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm install
npm run db:migrate
npm run db:generate

# Create the first DartCodes platform administrator (do not commit the password)
npm run create-platform-admin -- --email=admin@dartcodes.lk --name="DartCodes Admin" --password="YourStrongPass1!"

npm run dev
```

Open:
- Web: http://localhost:5173
- Health: http://localhost:4000/api/health
- Register: http://localhost:5173/register
- Platform admin: http://localhost:5173/platform-admin
- Clinic login: http://localhost:5173/login

## Phase 1 demonstration
1. Register **Hello Medi Help** at `/register`
2. Approve it at `/platform-admin`
3. Confirm a `clinic_<uuid>` schema was created in PostgreSQL
4. Sign in at `/login` and verify `/dashboard` shows **Welcome, Hello Medi Help**
5. Repeat with a second clinic and confirm schema isolation

## Scripts
| Command | Purpose |
|---|---|
| `npm run db:migrate` | Apply checked-in Prisma migrations (`prisma migrate deploy`) |
| `npm run db:generate` | Generate Prisma client |
| `npm run create-platform-admin` | One-time platform admin bootstrap CLI |
| `npm run db:poc` | Local namespace separation POC |
| `npm run dev` | Run web + API |
| `npm run test` | Unit tests |
| `npm run test:integration` | DB/API integration tests (skips if DB/API unavailable) |
| `npm run typecheck` / `npm run build` | Verify TypeScript and production builds |

## Architecture notes
See `docs/ARCHITECTURE.md` and `docs/PHASE1.md`.

Prisma owns the shared `platform` schema only. Approved dispensaries receive dedicated `clinic_<opaque>` schemas via versioned SQL. Static Prisma `@@schema` mappings are not used for dynamic tenant routing.

## Security / production blockers still open
- No MFA for platform administrators
- App DB role privilege separation (runtime vs provisioning) should be tightened
- No clinical modules, encrypted backups, or compliance sign-off yet
