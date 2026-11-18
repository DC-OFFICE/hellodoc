# HelloDoc — SaaS Starter (DartCodes Pvt Ltd)

**Status: development foundation only. NOT production ready; do not enter real patient data.**

This repository is the initial project setup for the HelloDoc clinic/dispensary management SaaS.

## Stack
- **Web**: React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui CLI configuration.
- **API**: NestJS 11, Prisma ORM 7 (platform registry only), TypeScript.
- **Database**: PostgreSQL 17; Redis 7 reserved for background messaging jobs.
- **Structure**: npm workspaces; one web app + one API for MVP.

## Requirements
- Node.js **22.22.3+** (or a current supported Node 24 release), npm
- Docker Desktop / Docker Engine with Compose

## Quick start
```bash
# From the hellodoc-starter directory
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm install
npm run db:up
npm run db:migrate
npm run db:generate
npm run dev
```
Open:
- **HelloDoc web**: http://localhost:5173
- **NestJS health check**: http://localhost:4000/api/health

At the first `db:migrate`, Prisma may ask to create the `platform` schema and migrations. Review and **commit the generated migration files**. Generate and commit `package-lock.json`. For production, use checked-in migrations and `prisma migrate deploy`, never `migrate dev`.

## Separate-schema proof of concept
```bash
npm run db:poc
```
This script creates two **local-only** test schemas and confirms separate namespaces. It does **not** prove authorization or Prisma dynamic client routing. Do not store patient data there.

## shadcn/ui components
The project includes `components.json` and alias setup; components have not been generated. Once dependencies are installed:
```bash
cd apps/web
npx shadcn@latest add button card input dialog table
```
Follow the CLI prompts and verify resulting UI in Vite.

## Scripts
| Command | Purpose |
|---|---|
| `npm run db:up` | Start local PostgreSQL + Redis |
| `npm run db:migrate` | Prisma dev migration for `platform` control-plane schema |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:poc` | Local namespace separation test |
| `npm run dev` | Run web + API in watch mode |
| `npm run typecheck` | Type-check apps |
| `npm run build` | Build apps |

## Folder structure
```text
hellodoc-starter/
├── apps/
│   ├── web/                 # React frontend; shadcn-ready
│   └── api/
│       ├── prisma/          # platform control-plane Prisma schema
│       ├── scripts/         # local schema-per-clinic namespace POC
│       └── src/             # NestJS API foundation
├── docs/
│   ├── ARCHITECTURE.md     # tenant boundaries and unresolved risk
│   └── FIRST-SPRINT.md    # checklist to first deployable slice
├── docker-compose.yml
└── package.json
```

## IMPORTANT — schema-per-dispensary
`platform` contains platform/tenant/user membership data. The intended clinic design is a dedicated Postgres schema for each dispensary. **No clinical-data ORM layer is wired here**, because dynamically selecting those schemas with Prisma 7 needs a dedicated validated design. See `docs/ARCHITECTURE.md`.

## Security / production blockers
- No authentication or authorization yet.
- No real tenant provisioning endpoint.
- No encrypted object storage, clinical records, access audits, backup restore, monitoring or SMS gateway integration yet.
- Local Docker passwords are intentionally development-only.
- Validate compliance with Sri Lanka's personal-data and healthcare rules before handling live patient data.

## Next build order
1. Prove dynamic tenant schema routing and DB permission isolation.
2. Implement secure platform admin + clinic provisioning.
3. Create clinic user roles, sessions and patient registration.
4. Add booking and live queue engine; then consultation, prescriptions and invoicing.

For MVP milestones, refer to the latest HelloDoc roadmap and DartCodes SRS.
