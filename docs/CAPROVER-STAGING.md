# HelloDoc on CapRover — step-by-step staging setup

Use your existing CapRover at `captain.straightline.cloud`.  
**Do not copy the local HelloDoc database.** Create a fresh Postgres app.

Release status stays **NO-GO** until hosted MFA, PITR/backups, monitoring, and external reviews pass.

---

## What you will create (3 apps)

| CapRover app name | Role | Persistent? | Exposed as web? |
| --- | --- | --- | --- |
| `hellodoc-staging-db` | PostgreSQL 16 | Yes | **No** |
| `hellodoc-staging-api` | NestJS API | No | Yes + HTTPS |
| `hellodoc-staging-web` | React SPA (nginx) | No | Yes + HTTPS |

Optional: create a CapRover **Project** named `hellodoc` and put these three apps under it (same pattern as your ERP apps).

Suggested public URLs (confirm exact host pattern CapRover shows after create):

- `https://hellodoc-staging-web.straightline.cloud`
- `https://hellodoc-staging-api.straightline.cloud`

If your apps use `*.captain.straightline.cloud` or another wildcard, use those instead everywhere below.

---

## Step 1 — Create empty PostgreSQL

1. Open **Apps** → **Create A New App**.
2. App name: `hellodoc-staging-db`
3. Enable **Has Persistent Data**.
4. Enable **Do not expose as web app** (database stays private).
5. Create the app.
6. Open `hellodoc-staging-db` → **App Configs**:
   - Add volume: host path name `hellodoc-staging-db-data` → container path `/var/lib/postgresql/data`
   - Environment variables (choose a strong password; store it in your password manager — **not in chat/Git**):

| Key | Value |
| --- | --- |
| `POSTGRES_USER` | `hellodoc` |
| `POSTGRES_DB` | `hellodoc_staging` |
| `POSTGRES_PASSWORD` | *(strong unique password)* |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` |

7. **Deployment** tab → Method: **Method 1: Dockerfile / Image Name** (or paste Captain Definition):

```json
{
  "schemaVersion": 2,
  "imageName": "postgres:16-alpine"
}
```

8. Deploy and wait until logs show PostgreSQL is ready to accept connections.
9. Note the **internal hostname**. On current CapRover this is usually the app name `hellodoc-staging-db`. On some setups it is `srv-captain--hellodoc-staging-db`. Check **App Configs** / docs for “service name”, or from server: `docker service ls`.

---

## Step 2 — Create the API app (before first deploy)

1. **Create A New App** → `hellodoc-staging-api`
2. Persistent data: **off**
3. Exposed as web app: **yes**
4. **HTTP Settings**:
   - Container HTTP Port: `4000`
   - Enable HTTPS
   - Force HTTPS
5. **App Configs → Environment variables** (enter secrets only in CapRover UI):

| Key | Example / guidance |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `MFA_REQUIRED` | `true` |
| `DATABASE_SSL` | `false` *(private Docker network TLS usually off; set `true` only if your Postgres requires it)* |
| `COOKIE_SAMESITE` | `none` |
| `SMS_PROVIDER` | `fake` |
| `SMS_DISPATCH_ENABLED` | `false` |
| `SMS_DEFAULT_SENDER_ID` | `HelloDoc` |
| `CORS_ORIGIN` | `https://hellodoc-staging-web.straightline.cloud` *(your real web URL)* |
| `PUBLIC_WEB_ORIGIN` | same as `CORS_ORIGIN` |
| `DATABASE_URL` | `postgresql://hellodoc:YOUR_PASSWORD@hellodoc-staging-db:5432/hellodoc_staging?schema=platform` |
| `SMS_PAYLOAD_ENCRYPTION_KEY` | long random secret (new; not local `dev-only`) |
| `MFA_ENCRYPTION_KEY` | long random secret |

Replace `hellodoc-staging-db` in `DATABASE_URL` with `srv-captain--hellodoc-staging-db` if that is your CapRover service name.

6. Save. Do **not** deploy yet until the repo files below exist on the machine you’ll deploy from (they are already in this repo under `deploy/caprover/`).

---

## Step 3 — Create the web app (before first deploy)

1. **Create A New App** → `hellodoc-staging-web`
2. Persistent data: **off**
3. **HTTP Settings**:
   - Container HTTP Port: `80`
   - Enable HTTPS
   - Force HTTPS
4. You will pass the API public URL as a **Docker build arg** `VITE_API_BASE_URL` when building (see Step 5). Example value:  
   `https://hellodoc-staging-api.straightline.cloud/api`

---

## Step 4 — Deploy API from your PC (Git repo root)

On your Windows machine, in the HelloDoc repo root (`d:\OFFICE\hellodoc`):

### Option A — CapRover CLI (recommended)

```powershell
npm i -g caprover
caprover login
# Server: https://captain.straightline.cloud
```

Deploy API (Captain Definition path points at the API definition):

```powershell
# Copy definition to the name CapRover expects for this deploy, or pass --caproverPath
Copy-Item .\deploy\caprover\captain-definition.api .\captain-definition -Force
caprover deploy -a hellodoc-staging-api
Remove-Item .\captain-definition -Force
```

### Option B — Dashboard tarball

From repo root, create an archive that includes `captain-definition` at the root of the archive:

```powershell
Copy-Item .\deploy\caprover\captain-definition.api .\captain-definition -Force
tar -cf hellodoc-api-deploy.tar --exclude=node_modules --exclude=.git --exclude=apps/web/test-results captain-definition deploy apps/api apps/web/package.json package.json package-lock.json .dockerignore
Remove-Item .\captain-definition -Force
```

In CapRover → `hellodoc-staging-api` → **Deployment** → upload tarball → Deploy.

5. Open **App Logs**. You want:
   - Prisma migrate success
   - `HelloDoc API listening on 0.0.0.0:4000`
6. Test: `https://hellodoc-staging-api.YOUR_DOMAIN/api/health/live`  
   Then `/api/health/ready` (needs DB connectivity).

---

## Step 5 — Deploy web SPA

Build arg must match the live API HTTPS URL + `/api`.

### CLI with build arg

CapRover supports Dockerfile build args in App Configs on many versions. Set:

| Build arg | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://hellodoc-staging-api.YOUR_DOMAIN/api` |

Then:

```powershell
Copy-Item .\deploy\caprover\captain-definition.web .\captain-definition -Force
caprover deploy -a hellodoc-staging-web
Remove-Item .\captain-definition -Force
```

If your CapRover build-arg UI is missing, temporarily bake the URL into the Dockerfile `ARG` default for staging only, deploy, then revert — or rebuild using a one-off Dockerfile line. Prefer the CapRover build-arg field when available.

7. Enable HTTPS / Force HTTPS if not already.
8. Open the web URL; hard-refresh. Direct open `/login` must not 404 (nginx SPA rewrite).

---

## Step 6 — Bootstrap staging admin (empty DB only)

From a trusted machine with staging `DATABASE_URL` and encryption keys in a **local throwaway env file that is never committed**:

```powershell
npm run create-platform-admin -w @hellodoc/api -- --email=staging-admin@example.com --name="Staging Admin" --password="<strong-password>"
```

Then in the browser:

1. Open the staging web URL → platform/clinic login as documented in your UI.
2. Enroll MFA (`MFA_REQUIRED=true`).
3. Register **two synthetic clinics** through the real UI.
4. Approve them as platform admin.
5. Confirm each clinic has its own `clinic_*` schema (via a private DB client to the CapRover network, or API behaviour). Do **not** import local dumps.

---

## Step 7 — What to send back (no secrets)

Reply with only:

1. Staging frontend URL  
2. Staging API URL  
3. Whether `hellodoc-staging-db`, `hellodoc-staging-api`, and `hellodoc-staging-web` are all running  

Do **not** send passwords, `DATABASE_URL`, encryption keys, or session cookies.

---

## Backups / PITR on CapRover

CapRover’s Postgres container is **not** managed Render PITR. For staging DR you must either:

- Schedule `pg_dump` (custom format) to off-server encrypted storage and periodically restore into a **separate** CapRover DB app, or  
- Put Postgres on a managed provider with PITR and point `DATABASE_URL` at it while keeping API/web on CapRover.

Document measured RPO/RTO against the provisional 1h / 4h targets before any GO discussion.

---

## CI/CD (GitHub Actions)

Workflows in `.github/workflows/`:

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | PR + push to `main`/`master` | `npm ci`, Prisma generate, typecheck, unit tests, build |
| `deploy-staging.yml` | push to `main`/`master` (app paths) or **Run workflow** | CI gates → build/push to **CapRover registry** → CapRover image deploy |

### One-time GitHub setup

1. Create CapRover apps `hellodoc-staging-api` and `hellodoc-staging-web` (and DB) as above.
2. In each app’s **Deployment** tab → enable **App Token** → copy token.
3. CapRover → **Cluster** → Docker Registries → find `captain` @ `registry.straightline.cloud:996` → **Edit** → copy the registry **password** (do not paste it into chat).
4. In GitHub repo → **Settings → Secrets and variables → Actions**:

**Secrets**

| Name | Value |
| --- | --- |
| `CAPROVER_SERVER` | `https://captain.straightline.cloud` |
| `CAPROVER_APP_TOKEN_API` | token from `hellodoc-staging-api` |
| `CAPROVER_APP_TOKEN_WEB` | token from `hellodoc-staging-web` |
| `CAPROVER_REGISTRY` | `registry.straightline.cloud:996` |
| `CAPROVER_REGISTRY_USER` | `captain` |
| `CAPROVER_REGISTRY_PASSWORD` | password from CapRover Cluster → that registry row |

**Variables**

| Name | Example |
| --- | --- |
| `STAGING_VITE_API_BASE_URL` | `https://hellodoc-staging-api.straightline.cloud/api` |

5. Push the updated workflow to `main`, or **Actions → Deploy CapRover staging → Run workflow**.
6. CapRover Build Logs should show `Pulling this image: registry.straightline.cloud:996/captain/hellodoc-staging-…` then success.
7. Confirm `/` is **not** “Your app will be here!”, `/login` returns **200**, and `/api/health/live` returns JSON.

App env vars (`DATABASE_URL`, encryption keys, MFA, CORS) stay in CapRover App Configs — not in GitHub.

### Why this registry path?

| Approach | Result here |
| --- | --- |
| Private GHCR pull | CapRover `denied` (packages cannot be Public) |
| Source tar build on CapRover | Deploy version created, **empty build logs**, still placeholder |
| Push to CapRover’s own registry | CapRover already trusts `captain` @ `registry.straightline.cloud:996` |

## Files added in this repo

| Path | Purpose |
| --- | --- |
| `deploy/caprover/Dockerfile.api` | API image + migrate on start |
| `deploy/caprover/Dockerfile.web` | Vite build + nginx SPA |
| `deploy/caprover/nginx.web.conf` | `/login` etc. rewrite |
| `deploy/caprover/captain-definition.api` | CapRover API definition |
| `deploy/caprover/captain-definition.web` | CapRover web definition |
| `deploy/caprover/captain-definition.db.json` | Optional Postgres image definition |
| `.github/workflows/ci.yml` | PR/main verification |
| `.github/workflows/deploy-staging.yml` | GHCR build + CapRover staging deploy |

`render.yaml` can stay as an alternate provider option; **your path is CapRover**.
