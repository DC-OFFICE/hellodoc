# HelloDoc hosted staging runbook (Milestone 9E)

Status: **CapRover is the chosen host for DartCodes** (`captain.straightline.cloud`).  
Step-by-step CapRover instructions: [`docs/CAPROVER-STAGING.md`](./CAPROVER-STAGING.md).  
`render.yaml` remains an optional alternate Blueprint if Render is used later.

**Do not restore, clone, or upload the local development database** (it contains ~129 schemas / ~380 users of test fixtures and residual personal data). Staging starts empty and is populated only with synthetic clinics through the application.

## Architecture (CapRover — primary)

| CapRover app | Role | Notes |
| --- | --- | --- |
| `hellodoc-staging-db` | PostgreSQL 16 | Persistent volume; **not** exposed as web app |
| `hellodoc-staging-api` | NestJS | Port `4000`, HTTPS, `MFA_REQUIRED=true` |
| `hellodoc-staging-web` | React + nginx | Port `80`, SPA rewrite, HTTPS |

Docker / Captain Definition files: [`deploy/caprover/`](../deploy/caprover/).

Follow **[`docs/CAPROVER-STAGING.md`](./CAPROVER-STAGING.md)** for the full click-path.

`COOKIE_SAMESITE=none` is required because web and API are different CapRover hostnames.

## Secrets checklist (CapRover App Configs only)

| Variable | Guidance |
| --- | --- |
| `CORS_ORIGIN` / `PUBLIC_WEB_ORIGIN` | Exact SPA HTTPS origin |
| `DATABASE_URL` | Fresh staging DB only; internal hostname + strong password |
| `SMS_PAYLOAD_ENCRYPTION_KEY` / `MFA_ENCRYPTION_KEY` | New long secrets; never reuse local `dev-only` |

## Deploy sequence (summary)

1. Create empty `hellodoc-staging-db` (Postgres 16 image) — no local dump.
2. Create `hellodoc-staging-api` + env vars + HTTPS on port 4000; deploy via `deploy/caprover/Dockerfile.api`.
3. Create `hellodoc-staging-web` + HTTPS on port 80; build with `VITE_API_BASE_URL=https://…api…/api`.
4. Confirm `/api/health/live` and `/api/health/ready`.
5. Bootstrap platform admin with `create-platform-admin` against staging (password typed locally).
6. Enroll MFA; register/approve two **synthetic** clinics in the UI.
7. Schedule off-server `pg_dump` backups (CapRover Postgres is not managed PITR unless you attach an external managed DB).
8. Wire monitoring/alerts on your CapRover host.

## Application startup notes (audited)

- API binds `0.0.0.0` and honors `PORT` (Render injects this).
- `trust proxy` enabled for TLS-terminated proxies.
- Production boot refuses MFA-off, localhost CORS, non-https `PUBLIC_WEB_ORIGIN`, weak encryption keys, and fake SMS left dispatching (`assertProductionConfig`).
- Platform Prisma migrations run via `preDeployCommand`: `prisma migrate deploy`.
- Tenant SQL migrations live under `apps/api/tenant-migrations/` through `009_billing` (+ clinical/SMS earlier numbers).
- SPA requires `VITE_API_BASE_URL` at **build** time.

## Hosted verification matrix (after go-live)

| Check | Evidence required |
| --- | --- |
| Fresh DB | No local schema/user counts; only staging-created tenants |
| MFA | Platform admin + clinic manager enroll/challenge on HTTPS |
| Receptionist / doctor / cashier | Synthetic browser or API smoke on hosted URLs |
| Tracking + SSE | Public track link; queue board live or polling fallback |
| Isolation | Clinic A cannot read Clinic B IDs |
| SPA refresh | Direct open `/login`, `/dashboard`, `/track/...` |
| PITR | Restore into separate DB; RPO/RTO vs 1h / 4h recorded |
| Alerts | Controlled test event reaches an operator |

## Explicit non-goals

- Do not copy local `hellodoc` dump into staging.
- Do not create real patient records.
- Do not claim production GO from staging alone.
- Do not commit secrets or paste them into chat.

## Current blockers

- Render workspace + Blueprint not applied by DartCodes yet.
- Hosted MFA / browser / PITR / alert evidence not yet executable from this environment.
- Clinical, accounting, privacy, and live SMS gates remain open (unchanged).
