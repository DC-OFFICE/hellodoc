# HelloDoc pilot readiness

Date: 19 November 2026 (Milestone 9E: Render staging Blueprint prepared; live host not yet provisioned)
Decision: **NO-GO** for real patient or payment use.

This is an engineering record. It is not a clinical certification, an accounting opinion, a privacy-law opinion, or a claim that live SMS delivery has been verified.

## Checklist

| Gate | Status |
| --- | --- |
| Mandatory MFA | Local enforcement harness with `MFA_REQUIRED=true` on port 4010: **23/23 passed** (platform admin + clinic manager enroll/challenge/TOTP/recovery/re-enroll). Platform MFA enroll/confirm/disable endpoints added. Not yet proven on a hosted staging host; doctor/cashier/receptionist share the same API guard path but do not yet have dedicated MFA browser UAT. |
| Tenant security | Prior authenticated two-clinic HTTP tests passed again on 18 November 2026 (21/21 integration tests). |
| Clinical approval | Not reviewed by a qualified clinician. |
| Financial approval | Not reviewed by a qualified local accountant. VAT tax-invoice mode stays off. |
| Backup and restore | Local dump + isolated restore verified 19 Nov 2026 (`RESTORE_OK`, 380 platform users, 129 schemas). Application role still lacks `CREATEDB` on the primary host; script uses `RESTORE_TEST_ISOLATED_CLUSTER=1`. Hosted scheduled backups, WAL, and timed production restore remain open. |
| Live SMS | Blocked. No approved Text.lk credential was used. The fake provider remains the local adapter. |
| Browser UAT | Milestone 9C: **16/16** authenticated journeys. Milestone 9D: dedicated **receptionist** browser UAT added and passed (`reception.receptionist.spec.ts`: register → book → open/check-in/queue + denied billing/clinical writes). |
| Production operations | Render Blueprint (`render.yaml`) + staging runbook ready. Cookie `SameSite=None` support, `trust proxy`, and managed-Postgres TLS pool options added for hosted split SPA/API. **Live staging URLs, hosted MFA/PITR/alerts remain BLOCKED** until DartCodes applies the Blueprint and sets Dashboard secrets. Never clone the local DB into staging. |

## What this pass changed

### Milestone 9E preparation (19 November 2026)

- Added root `render.yaml`: Singapore Postgres 16 (`ipAllowList: []`), always-on API with `preDeployCommand` Prisma migrate, static SPA with React Router rewrite, `MFA_REQUIRED=true`, fake SMS disabled for dispatch.
- Hosting fixes: `COOKIE_SAMESITE=none|lax`, Express `trust proxy`, `DATABASE_SSL` pool options for Prisma + tenant SQL.
- Updated `docs/STAGING-RUNBOOK.md` with DartCodes decision list, secret checklist (no values), deploy sequence, and hosted verification matrix.
- **Not done (requires Render account):** actual Blueprint apply, HTTPS smoke, hosted MFA, PITR restore into a separate DB, alert test event.

### Milestone 9D progress (19 November 2026)

- **Inventory (read-only):** `npm run inventory:classify -w @hellodoc/api` → 129 schemas / 380 platform users / 127 tenants. Majority are disposable E2E and integration fixtures (`clinic_*e2e*`, `clinic_bill_*`, `clinic_clin_*`, `clinic_iso_*`, `*@example.com`). Do **not** auto-delete. Do **not** clone this database to production. One non-synthetic personal email appears in local `PlatformUser`; treat as local-dev residue pending an approved cleanup plan.
- **MFA:** Temporary API with `MFA_REQUIRED=true` (`scripts/mfa-enforcement-check.mjs`, port 4010) → **23/23 passed**. Covers platform admin + clinic manager: enrollment gate on protected APIs, TOTP challenge, invalid code rejection, post-MFA access, session revoke after confirm, recovery-code disable, mandatory re-enrollment. Added missing `POST /platform-auth/mfa/{enroll,confirm,disable}`. No MFA bypass was added. Doctor/cashier/receptionist MFA browser UAT still open (same AuthGuard path).
- **Receptionist browser UAT:** `reception.receptionist.spec.ts` passed under desktop-auth (register → book → open session → check-in → call/start/finish + invoices/encounters denied).
- **Hosted staging / PITR / monitoring / SMS / external sign-offs:** BLOCKED or external — see `docs/STAGING-RUNBOOK.md`.

### Backup / disaster-recovery check (19 November 2026)

- `pg_dump --format=custom` of local `hellodoc` succeeded (`DUMP_OK bytes=15751618`).
- Full restore into a disposable PostgreSQL 16 cluster on port `55432` succeeded without touching the source DB: `RESTORE_OK database=hellodoc_restore_check platform_users_table=present platform_user_rows=380 schema_count=129`.
- Repeatable command (from repo root):  
  `RESTORE_TEST_ISOLATED_CLUSTER=1 npm run backup:check -w @hellodoc/api`  
  (uses `apps/api/scripts/restore-check.mjs`; cluster dir `.pg-restore-cluster/` is gitignored and deleted after the run).
- Still **not** met for pilot hosting: scheduled encrypted backups, off-box retention, WAL/PITR, and a timed restore on the production host.

### Milestone 9C (19 November 2026)

- Authenticated Playwright projects reuse role storage state from a setup login (`.auth/` gitignored). Disposable seed script provisions Clinic A/B with manager, doctor, cashier, receptionist memberships, sessions, patients, and tracking tokens.
- Reception browser workflow verified with **clinic manager** (not claimed as receptionist-role UAT). Spec exercises register → shared-phone warning → book → check-in → queue ops against live UI/API.
- Doctor: worklist → vitals → draft persist after reload → sign → prescription draft/sign → authorized print HTML.
- Cashier: draft invoice → issue → partial cash → remaining card → PAID persist after reload → denied clinical/settings writes.
- Public tracker: unauthenticated track link shows clinic/queue only (no patient number/phone/Rx); invalid token rejected.
- Authorization: cashier/receptionist denied privileged APIs; manager A denied clinic B patient/appointment IDs; unauthenticated routes redirect to login.
- Tablet/mobile authenticated specs cover navigation, booking, queue, worklist, and invoice list usability (not a full re-run of every desktop money/clinical click path).
- Application fixes from failed runs: preserve consultation draft fields across vitals save; allow prescription draft after signed encounter; label payment amount/method; allow cashier patient directory read for invoicing.

### Milestone 9A/9B (retained)

- `MFA_REQUIRED=true` is enforced in `AuthGuard` and clinic context resolution. Enrollment, account, logout, and health routes stay reachable so a signed-in user can enroll. Other protected APIs return `MFA_ENROLLMENT_REQUIRED`.
- Production startup refuses to boot unless MFA is required, the encryption key is not a development placeholder, the public origin is HTTPS, CORS is not localhost, and the fake SMS provider is not left dispatching.
- TOTP verification records the accepted time step. The same step cannot be reused. Eight recovery codes are returned once, stored as SHA-256 hashes, and each code is 128 bits. Disabling MFA requires the password plus a fresh authenticator code or an unused recovery code, then revokes sessions and clears the clinic cookie.
- Platform administrators with MFA confirmed get a challenge whose clinic id is null. That challenge can only create a platform session.
- `clinic_receptionist` reuses staff invitations and tenant membership. Reception can register patients, book appointments, read doctors and sessions, and operate the queue. Reception cannot sign notes, read prescriptions, change billing settings, refund, or post credit notes.
- `/health/live` does not touch the database. `/health/ready` and `/health` return 503 when PostgreSQL is unavailable.
- Local development keeps `MFA_REQUIRED` unset so the existing suite can sign in. That setting is not a production configuration.

## Permission matrix

| Action | Platform admin | Manager | Doctor | Cashier | Receptionist | Public tracking |
| --- | --- | --- | --- | --- | --- | --- |
| Approve clinics and platform settings | Yes | No | No | No | No | No |
| Register patients, book, check in, run queue | No | Yes | No | No | Yes | No |
| Create or change doctors and sessions | No | Yes | No | No | No | No |
| Read doctor and session lists | No | Yes | No | No | Yes | No |
| Sign encounters and prescriptions | No | No | Own linked profile only | No | No | No |
| Issue invoices and record payments | No | Yes | No | Yes | No | No |
| Refunds, credit notes, billing settings | No | Yes | No | No | No | No |
| Read another clinic's records | No | No | No | No | No | No |

A person with more than one active clinic membership cannot sign in until clinic selection exists. Do not give one person both manager and receptionist memberships on the same clinic; login treats that as multiple memberships.

Browser routes are not a security boundary. The API is. A receptionist who types a billing URL receives an authorization error from the API.

## Risk register

| Severity | Component | Failure | Mitigation | Evidence | Status | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| Critical | Clinical use | A prescription layout or allergy workflow is wrong for real patients | Keep clinical use disabled until a named clinician reviews it | No reviewer recorded | Open | Clinic medical lead |
| Critical | Billing | VAT or invoice wording is wrong for Sri Lanka | Ordinary receipts only; no VAT mode | No accountant recorded | Open | Clinic accountant |
| High | MFA | A production process starts with MFA off, or hosted MFA never demonstrated | Boot refuses MFA-off in production; local `mfa:check` proves API enforcement | `npm run mfa:check -w @hellodoc/api` → 23 passed (19 Nov 2026). Hosted staging MFA still open | Partial | DartCodes |
| Medium | Local DB inventory | Copying the local DB to production would carry hundreds of synthetic tenants/users | Keep local DB disposable; provision empty staging/prod DBs; optional reviewed cleanup later | `inventory:classify`: 129 schemas (56 e2e, 28 integration bill/clin, 43 other clinic, platform+public); 380 users (~338 synthetic `@example.com`/`e2e`, ~41 `*.test`/ops-like, 1 non-test personal email present locally) | Open | DartCodes |
| High | Recovery | Hosted/scheduled restore and RPO/RTO not proven | Local isolated-cluster restore works; production host still needs scheduled encrypted dumps + timed restore drill | `RESTORE_TEST_ISOLATED_CLUSTER=1` → `DUMP_OK bytes=15751618` then `RESTORE_OK … platform_user_rows=380 schema_count=129` (19 Nov 2026) | Partial | DartCodes |
| High | SMS | Unverified Text.lk sends, or duplicate sends | Dispatcher stays on the fake provider locally; production boot refuses fake dispatch | No live credential in this pass | Blocked | DartCodes |
| High | Privacy | PDPA roles, notices, and contracts are not reviewed | Document data categories and stop clinic-to-clinic transfer | This file, privacy section | Open | DartCodes and counsel |
| Medium | Receptionist | Dedicated receptionist browser journey | Added and executed receptionist Playwright workflow | `receptionist:` desktop-auth passed 19 Nov 2026 (register/book/queue + API denials) | Mitigated | DartCodes |
| Medium | Browser | Authenticated journeys previously unverified | Milestone 9C Playwright against live NestJS + synthetic seed DB | `npm run test:e2e` → 16 passed (19 Nov 2026); report `apps/web/playwright-report` | Mitigated | DartCodes |
| Low | Client routes | A staff member can open a URL their role cannot use | API returns 401 or 403 | `GET /api/clinic/patients` without a session returned 401 | Accepted | DartCodes |

## Evidence from this pass

- API and web TypeScript checks passed after the receptionist and MFA changes.
- Unit tests: 32 passed, 0 failed. That includes money, TOTP step replay, and production configuration.
- Integration tests against the local API: 21 passed, 0 failed. That rerun includes two-clinic HTTP isolation, clinical access, and billing concurrency.
- `GET /api/health/live` returned liveness ok. `GET /api/health/ready` returned database up.
- Backup/restore (19 Nov 2026): `DUMP_OK bytes=15751618 archive_entries=11371` then isolated-cluster `RESTORE_OK … platform_user_rows=380 schema_count=129`. Source `hellodoc` on port 5432 was not restored onto and was not dropped. Primary app role still cannot `CREATE DATABASE` on the live host; use `RESTORE_TEST_ISOLATED_CLUSTER=1` locally.
- Milestone 9C authenticated browser E2E (19 November 2026): `npm run test:e2e` from `apps/web` → **16 passed, 0 failed**. Seed used disposable clinics `HelloDoc E2E Clinic A/B` (runId `f62ab8`) against the local API. Coverage: login responsive (desktop/tablet/mobile); **manager** reception (register → book → check-in → queue); doctor worklist → draft → sign → prescription → print; cashier invoice → partial → full payment; public tracker without private patient fields; role/tenant isolation (cashier, manager A vs clinic B, unauthenticated, receptionist denied privileged surfaces); tablet and mobile authenticated navigation for reception/doctor/cashier screens. HTML report: `apps/web/playwright-report`. Chromium browsers installed under `.playwright-browsers/` on D: (C: near full).
- Bugs fixed during 9C: consultation vitals save no longer wiped in-progress draft fields; prescription draft allowed after consultation is signed; payment Amount/Method labels wired for accessibility; cashier patient directory ACL for invoice selection.
- Live Text.lk delivery was not attempted.

Earlier milestone tests remain the evidence for signed-note immutability, allergy `UNKNOWN`, queue completion not signing notes, invoice cents, concurrent overpay rejection, and cross-clinic collection totals. They passed again in the 21-test rerun. They do not replace clinician or accountant review.

## Backup and restore

From the repo root:

```text
# Dump only (not a recovery test)
npm run backup:check -w @hellodoc/api

# Dump + restore into a temporary local PostgreSQL cluster (recommended when the app role lacks CREATEDB)
RESTORE_TEST_ISOLATED_CLUSTER=1 npm run backup:check -w @hellodoc/api
```

On Windows PowerShell: `$env:RESTORE_TEST_ISOLATED_CLUSTER='1'; npm run backup:check -w @hellodoc/api`

Alternatives: set `RESTORE_TEST_URL` to an empty differently named database, or `RESTORE_TEST_CREATE=1` when the role may create `hellodoc_restore_check` on the source host. The script deletes temporary archives and the isolated cluster. It will not restore when the target name equals the source name.

The provisional targets are a one-hour recovery point and a four-hour recovery time. They are not met until a scheduled archive, WAL shipping, and a timed restore have been run on the hosting platform. Do not run a destructive restore against the live database.

Suggested retention until counsel says otherwise: daily encrypted backups for 30 days, weekly backups for 12 months, and secure deletion of expired copies. Backups must not be published on the web.

## Deployment and rollback

1. Tag a release from the reviewed commit.
2. Confirm CI, unit tests, and integration tests.
3. Take a database backup and confirm the archive can be listed.
4. Apply platform migrations with `prisma migrate deploy`.
5. Apply tenant migrations with the existing trusted runner. Do not drop a clinic schema.
6. Deploy the API, then the web app, over HTTPS.
7. Check `/api/health/live` and `/api/health/ready`.
8. Sign in with MFA, open one synthetic clinic, and confirm the queue board and SMS worker.
9. Watch 5xx responses, failed logins, and the SMS backlog.

Schema changes are not assumed to be reversible. If a migration cannot be expanded and contracted, restore the backup into a replacement database and point the application at it, or apply a forward repair. Do not automatically reset a clinic schema.

`apps/api/.env.production.example` lists variable names only. Production secrets stay in the host secret store. The API refuses the unsafe production combinations listed above.

Local, staging, and production stay separate. Staging uses synthetic patients. Do not copy real patient rows into staging without a separately approved process.

## Monitoring

- Liveness: the process is up.
- Readiness: PostgreSQL answers `SELECT 1`.
- Alert on readiness failure, repeated 5xx responses, failed tenant migration, SMS rows stuck past the lease window, and a burst of failed login or MFA attempts.
- Do not put patient names, phone numbers, clinical notes, or tracking tokens in alerts.
- The SMS dispatcher already uses a claim lease so a restarted process can retry an abandoned send. Uncertain provider responses must not create a second clinical send.

Hosted dashboards, paging, and storage-growth alerts are not connected yet.

## Privacy

HelloDoc stores clinic identity, staff accounts, patient identity and contact details, appointments, queue state, clinical notes, allergies, prescriptions, invoices, payments, refunds, and audit events. Clinics need these to run a dispensary visit and to keep a record of care and payment. DartCodes operates the service and does not become the treating clinic.

The clinic decides why the data is collected and what is told to the patient. DartCodes hosts and processes it for the clinic. Separate PostgreSQL schemas reduce cross-clinic access; they do not by themselves satisfy Sri Lanka's Personal Data Protection Act. The user brief says key provisions are scheduled for 1 January 2027. Counsel still needs to review contracts, notices, retention, breach response, and any international hosting transfer.

There is no supported clinic-to-clinic transfer. A data-subject request is handled by the clinic. Clinical entries that have been signed are corrected by addendum, not by silent edits. Backups follow the retention above and are deleted securely when the retention period ends. Account closure exports or deletes clinic data only through an agreed offboarding process that respects medical retention duties.

## SMS

Live Text.lk delivery is **blocked**. Do not describe it as verified. A pilot that needs SMS must use an approved credential, sender ID, and authorised test number, then record the handset result outside ordinary project docs. Until that happens, production configuration must keep dispatch disabled or use a verified provider.

## Pilot shape, after the gates pass

Use two or three clinics, one or two doctors each, and a small staff. Start with synthetic user acceptance, then staff training, then live use only after the gates below are true. Support needs a named contact and an incident path. Classify findings as critical, security or privacy, workflow blocker, usability, or future feature. Do not add pharmacy, laboratory, insurance, WhatsApp, or payment-gateway work in this phase.

## Go-live gates still open

1. MFA required and demonstrated for platform admin, manager, doctor, cashier, and receptionist. **Local API harness passed for platform admin + manager (23/23).** Hosted demo and per-role browser MFA UAT still open.
2. No open critical or high security issue.
3. Two-clinic isolation remains green. This item passed on 18 November 2026.
4. Two-doctor authorization remains green. This item passed inside the same integration rerun.
5. A named clinician approves the consultation and prescription output.
6. A named accountant approves tax treatment and document wording.
7. Backups are scheduled on the production host.
8. A full restore into an isolated database succeeds. **Local isolated-cluster restore passed 19 Nov 2026.** Production-host scheduled backup + timed restore still open.
9. Session and payment concurrency remain green. Covered by the existing integration rerun, not by a new load test.
10. Financial reconciliation remains green in tests. Accountant review is separate.
11. Production HTTPS and secret storage are verified on the host.
12. Health alerts reach a person.
13. Browser tests cover reception, doctor, cashier, and public tracking, including a logged-in session. **Met for manager/doctor/cashier/tracker/isolation on 19 Nov 2026** (16/16 Playwright). Dedicated receptionist-role browser UAT and MFA-on browser MFA challenge remain open.
14. Privacy notices and processing terms are reviewed.
15. SMS is verified or explicitly disabled.
16. Rollback and incident steps are rehearsed, not only written.
17. Pilot staff complete acceptance testing.

**NO-GO.** Real patient and payment use stays off until the open gates are closed with evidence.
