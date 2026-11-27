# 🍵 ShopTea — Production-Ready Tea Shop Inventory Management System

A multi-tenant, enterprise-grade inventory web application designed specifically for small tea shops, chai bars, and cafes. Stock levels are calculated automatically from recorded atomic stock movements (purchases, usage, wastage, and adjustments), eliminating stock drift, manual tampering, and negative inventory.

---

## 🏛️ System Architecture

```text
React 18 + Vite (Tailwind CSS + Lucide + Recharts)
                       │ (Axios + Credentials + HTTP-only Cookie)
                       ▼
   Node.js + Express + TypeScript REST API
    ├── Middlewares: Auth (JWT), Zod Validation, Error Handler
    ├── Services: Atomic Stock Mutations (prisma.$transaction)
    └── Units Engine: Mass (kg/g), Volume (L/ml), Count (packets/pieces)
                       │
                       ▼
      Prisma ORM 5 (Strict Multi-Tenancy Scoping)
                       │
                       ▼
        PostgreSQL on Neon (Decimal 12,3 Precision)
```

---

## Development Progress

Status labels: `NOT STARTED`, `IN PROGRESS`, `IMPLEMENTED`, `TESTING`, `COMPLETED`, `BLOCKED`.

1. **Phase 1: Authentication** — `COMPLETED`
   - Registration, email/username login, logout, JWT HTTP-only cookies, bcrypt, protected routes, public-only redirects, and session refresh.
   - Email verification and OTP are intentionally not implemented.
   - Backend/frontend builds and 12 automated API tests pass; browser smoke test passed registration, redirects, refresh persistence, onboarding logout, and post-logout protection.
2. **Phase 2: Shop Setup and Onboarding** — `COMPLETED`
   - Added validated shop type, timezone, and settings with a forward-only migration.
   - Shop creation is atomic, retry-safe, and idempotent under concurrent requests; authenticated `GET`/`PATCH` APIs are tenant-scoped.
   - Onboarding and settings UI passed browser verification; 10 Phase 2 API tests pass.
3. **Phase 3: Main Dashboard** — `COMPLETED`
   - Summary, valuation, stock status, recent movements, movement/wastage trends, and replenishment use tenant-scoped database data.
   - Loading, empty, error, refresh, custom-range, and configured-currency states passed browser verification.
   - Date-only transactions use local calendar boundaries; 9 Phase 3 API tests and the combined 31-test backend suite pass.
4. **Phase 4: Inventory Management** — `COMPLETED`
   - Tenant-scoped CRUD, archive/restore, search and filters, immutable ledger-backed stock, planning levels, supplier assignment, and dashboard valuation are implemented.
   - kg/g and L/ml input conversion normalizes quantities and costs; incompatible units and fractional count-unit levels are rejected.
   - Backend TypeScript, frontend production build, Prisma migration status, and all 12 Phase 4 API tests pass.
5. **Phase 5: Purchase Management** — `COMPLETED`
   - Added tenant-scoped purchase creation, history, filters, summaries, safe editing, cancellation, audit details, and a dedicated purchases UI.
   - Purchases use documented weighted-average costing, atomic stock updates, idempotency keys, immutable reversal/replacement records, and per-item row locks for concurrent requests.
   - Applied `20261127000000_purchase_audit_and_reversals`; dashboard movement trends now net original purchases against reversals correctly.
   - Backend typecheck/build, frontend production build, Prisma migration status, all 6 Phase 5 tests, all 9 dashboard tests, and the 49-test regression suite pass.
6. **Phase 6: Sales and Daily Stock Usage** — `COMPLETED`
   - Added tenant-scoped menu and recipe management, backend-priced sales, atomic recipe deductions, historical price/cost snapshots, and multi-item manual usage.
   - Sales and usage support idempotent creation, cancellation, linked reversal movements, stock restoration, audit details, filters, and history.
   - Dashboard summary now reports today's sales count, revenue, COGS, and gross profit; movement trends net cancelled usage reversals.
   - Applied `20261127000001_phase6_sales_recipes_and_usage` (renamed to preserve Phase 5 → Phase 6 migration order); added `/api/menu`, `/api/sales`, and `/api/usage-records` APIs and their responsive frontend pages.
   - Backend typecheck/build, frontend production build, Prisma migration status, all 6 Phase 6 tests, and the full 55-test backend regression suite pass.
7. **Phase 7: Stock Alerts and Notifications** — `COMPLETED`
   - Added persistent out-of-stock, low-stock, and reorder alerts with duplicate-safe active conditions, automatic resolution, threshold snapshots, read state, and resolved history.
   - Alert synchronization is atomic with inventory, purchase, sale, recipe, usage, wastage, adjustment, edit, cancellation, archive, and restoration operations.
   - Applied `20261127000002_phase7_stock_alerts`; added `/api/alerts`, `/api/alerts/summary`, `/api/alerts/read-all`, and `/api/alerts/:id/read` plus dashboard notifications, navigation badges, and a responsive alerts page.
   - Backend typecheck/build, frontend production build, Prisma migration status, and all 7 Phase 7 API tests pass.
8. **Phase 8: Reports and Analytics** — `COMPLETED`
   - Added tenant-scoped daily, weekly, and monthly sales, purchase, consumption, inventory valuation, item-wise analysis, and stock-movement reports.
   - Added equal-length prior-period comparisons, weighted-average inventory valuation, reliable historical COGS, conservative gross-profit withholding, and spreadsheet-safe CSV exports.
   - Added `/api/reports/overview` and `/api/reports/export` plus a responsive Recharts dashboard with date presets, custom dates, item filters, granularity, comparisons, tables, and exports.
   - No migration was required. Backend typecheck/build, frontend production build, all 6 Phase 8 API tests, and the 62-test pre-Phase-8 regression suite pass.
9. **Phase 9: Intelligent Stock Prediction** — `COMPLETED`
   - Added deterministic backend metrics and a modular weighted-moving-average forecast for future sales, ingredient consumption, stock-out dates, reorder dates, and purchase quantities.
   - Forecasts retain zero-activity days, expose data-quality levels, account for lead time and configurable safety stock, and clearly separate exact recorded values from statistical estimates.
   - Added authenticated `GET /api/forecasts` plus a responsive predictions page with configurable history/forecast windows, item filters, actual-versus-predicted charts, and reorder recommendations.
   - No migration was required. Backend typecheck/build, frontend production build, and all 5 Phase 9 API tests pass.
10. **Phase 10: Complete UI and UX** — `COMPLETED`
   - Added reusable buttons, cards, page headers, badges, loading/error/empty states, and focus-managed confirmation dialogs; desktop top navigation and mobile sidebar navigation are integrated.
   - Added a validated user-profile API/page and a dedicated consumption-history page with filters, pagination, details, and reversal movements.
   - Added route-level lazy loading, reducing the initial frontend JavaScript bundle from roughly 990 kB to 272 kB, and upgraded to React Router 7 with its v7 behaviors enabled by default.
   - Browser smoke tests passed registration, login, onboarding, all required protected routes, profile persistence, dialog keyboard behavior, mobile navigation, and report rendering; fixed an opening-stock `Invalid Date` defect found during testing.
   - No migration was required. Backend typecheck/build, all 14 authentication tests, frontend production build, and authenticated browser smoke tests pass. The optional OpenAI assistant remains intentionally omitted.
11. **Phase 11: Testing and Security** — `COMPLETED`
   - Added cookie-authenticated CSRF-header enforcement, equalized login password-check timing, trusted Render's reverse proxy in production, and added idempotent HTTP/Prisma graceful shutdown.
   - Upgraded backend and frontend Zod to 4.6.7, React Router to 7.18.7, React Hook Form to 7.55.0, and Hook Form resolvers to 5.2.2; both production dependency audits report zero vulnerabilities.
   - Verified password hashing, JWT/session rejection, secure production cookie defaults, exact-origin CORS, rate limiting, validated inputs, safe error responses, parameterized tenant-scoped queries, and ledger/idempotency constraints.
   - Backend/frontend typechecks and production builds pass; Prisma schema validation passes and all 9 migrations are applied. The complete backend regression suite passes 75/75 tests, including 14 authentication and 10 shop tests.
   - Post-upgrade browser smoke tests passed authentication, every protected route, reports, predictions, profile/settings, logout protection, and mobile navigation; fixed a mobile inventory grid overflow found during verification.
   - No migration was required.
12. **Phase 12: Deployment and Production** — `BLOCKED` pending hosting access and explicit deployment consent.
   - The GitHub repository exists, but production hosting has not been configured or deployed.
   - Deployment configuration is prepared in `render.yaml`, `frontend/vercel.json`, and `frontend/.env.example`; production environment guidance, migration safety, monitoring, backups, and end-to-end verification are documented below.
   - Configuration parsing and clean-install dry runs pass. No production deployment or production database migration has been performed.

---

## 🛠️ Quickstart (Local Development)

### 1. Prerequisites
- Node.js >= 20.x (Tested on v26.13)
- npm >= 9.x
- Neon PostgreSQL connection string (or local PostgreSQL)

### 2. Environment Variables
For the linked Neon project, `neon deploy` pulls connection variables into the ignored root `.env.local`. The backend loads that file first, then uses `backend/.env` for any missing settings. Do not commit either file.

For a manual/local setup, copy `.env.example` in `backend/`:
```bash
cp backend/.env.example backend/.env
```
Set both PostgreSQL URLs (use Neon's pooled URL for `DATABASE_URL` and its direct URL for `DATABASE_URL_UNPOOLED`):
```env
DATABASE_URL="postgresql://[user]:[password]@[neon-host]-pooler/[dbname]?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://[user]:[password]@[neon-host]/[dbname]?sslmode=require"
JWT_SECRET="your_32_character_secure_jwt_secret"
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```
The Prisma client uses `DATABASE_URL`; Prisma migrations use `DATABASE_URL_UNPOOLED`.

### 3. Database Migration & Seeding
```bash
# Generate Prisma Client
npm --prefix backend run prisma:generate

# Run DB Migrations (development)
npm --prefix backend run prisma:migrate

# Apply committed migrations to Neon/production
npm --prefix backend run prisma:deploy

# Optional local sample data only; never seed a production database.
# Set SEED_OWNER_EMAIL, SEED_OWNER_USERNAME, and SEED_OWNER_PASSWORD in backend/.env first.
npm --prefix backend run prisma:seed
```

### 4. Running the Development Servers
In two separate terminals:

**Backend API:**
```bash
npm --prefix backend run dev
```

**Frontend Client:**
```bash
npm --prefix frontend run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## Phase 12 Deployment Configuration

### Prepared files

- `render.yaml` defines the Node 22 backend web service, backend root directory, clean install with development build tools, Prisma client generation, production build, migration-before-start command, `/api/health` check, graceful shutdown window, and secret placeholders. Automatic deploys are disabled until explicitly enabled.
- `frontend/vercel.json` defines the Vite build, `dist` output, SPA fallback, immutable asset caching, and baseline browser security headers.
- `frontend/.env.example` documents the only frontend environment variable, `VITE_API_URL`.
- `backend/.env.example` documents exact-origin CORS, direct/pooled Neon URLs, JWT secret requirements, and cross-site cookie behavior.
- All package manifests declare Node.js `>=20`; Render is pinned to Node 22.

### Production topology

```text
Vercel React SPA (HTTPS)
  | Axios + credentials + X-Requested-With
  v
Render Express API (HTTPS, trusted proxy, /api/health)
  | Prisma
  v
Neon PostgreSQL (pooled runtime URL + direct migration URL)
```

Vercel and Render provide HTTPS. The backend sets Secure, HTTP-only session cookies and uses `SameSite=None` for cross-site hosting. `CLIENT_URL` must exactly match the Vercel origin without a trailing slash.

### Required production environment variables

| Platform | Variable | Value |
| --- | --- | --- |
| Vercel | `VITE_API_URL` | `https://<render-service>.onrender.com/api` |
| Render | `NODE_ENV` | `production` |
| Render | `NODE_VERSION` | `22` |
| Render | `DATABASE_URL` | Neon pooled PostgreSQL connection string |
| Render | `DATABASE_URL_UNPOOLED` | Neon direct PostgreSQL connection string |
| Render | `JWT_SECRET` | Unique random secret of at least 32 characters |
| Render | `JWT_EXPIRES_IN` | `7d` or another reviewed duration |
| Render | `CLIENT_URL` | `https://<vercel-project>.vercel.app` |
| Render | `COOKIE_SAME_SITE` | `none` for separate Vercel/Render origins |

Never prefix backend secrets with `VITE_`; Vite embeds such values in public JavaScript. Do not commit `.env`, `.env.local`, or production credentials.

### Deployment procedure

1. Upload a clean project snapshot to the GitHub repository. Exclude local environment files, dependencies, build output, caches, logs, local data, and QA screenshots.
2. Create a separate Neon production database or branch. Store its pooled URL as `DATABASE_URL` and direct URL as `DATABASE_URL_UNPOOLED`. Do not reuse development QA data as production data.
3. Import `frontend/` as a Vercel project with Root Directory `frontend`, Framework Preset Vite, Build Command `npm run build`, and Output Directory `dist`. Deploy once to obtain the production frontend origin.
4. Create a Render Blueprint from `render.yaml`. Set `CLIENT_URL` to the exact Vercel origin and provide the Neon URLs and a newly generated `JWT_SECRET` when prompted.
5. Render installs with `npm ci --include=dev`, generates Prisma Client, builds the API, runs `prisma migrate deploy` using the direct URL, and then starts the server. The health check is `GET /api/health`.
6. Set `VITE_API_URL` in Vercel to the Render URL including `/api`, then redeploy because Vite environment variables are build-time values.
7. Confirm CORS allows only the Vercel origin, login cookies are Secure/HTTP-only/SameSite=None, and cookie-authenticated mutations include `X-Requested-With: XMLHttpRequest`.
8. Enable automatic deploys only after reviewing the branch and rollout process. The prepared Render blueprint intentionally starts with automatic deploys off.

### Database safety, logging, and backups

- Use `prisma migrate deploy` for production. Never run `migrate reset`, force-resolve a failed migration, or seed production data as part of deployment.
- Review pending migrations and take a Neon branch/backup before each production migration. Verify the available point-in-time recovery and backup retention for the selected Neon plan, and periodically test restoration.
- Render captures application stdout/stderr. Configure service health alerts and log-based error notifications in the hosting dashboard. Production error responses do not expose internal error details.
- Add an external uptime monitor for the Vercel login page and Render `/api/health`. A process health check does not replace database monitoring or real authenticated API checks.
- Review Render/Vercel/Neon usage limits and choose paid production plans when uptime, backup retention, and support guarantees are required. Free tiers are suitable only for evaluation.

### Verification before release

Run locally against a clean production-like environment:

```bash
npm run typecheck
npm run build
npm --prefix backend test
npm --prefix backend audit --omit=dev
npm --prefix frontend audit --omit=dev
node backend/prisma-cli.cjs validate
node backend/prisma-cli.cjs migrate status
```

After deployment, complete the production browser checklist: registration, login/logout, shop onboarding, inventory create/update, purchase recording, sales with recipe deductions, daily usage, stock alerts, reports/exports, predictions, and data persistence after signing out and back in. Also verify direct deep links, mobile layouts, secure cookie attributes, CORS rejection of an untrusted origin, health checks, and log monitoring.

**Current blocker:** production deployment and its end-to-end tests require Vercel/Render/Neon access, real production environment values, and explicit user approval. No credentials have been requested, exposed, or stored in the repository.
