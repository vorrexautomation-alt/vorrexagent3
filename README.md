# Vorrex Agents — Full Platform (All Phases)

A multi-tenant, n8n-backed workflow platform: Owner creates clients (auto-generated
Email + Key login), each client sees only their own workflows, and an AI sidebar
("Vorrex Agents") edits any workflow via natural language.

## Phase → File Map

| Phase | What | Where |
|---|---|---|
| 1. Foundation | Supabase schema, RLS | `sql/schema.sql` |
| 2. Auth (Email+Key) | Client & owner login, JWT sessions | `lib/auth.ts`, `app/api/auth/*` |
| 3. Frontend | Login, owner dashboard, client dashboard, editor | `app/login`, `app/owner`, `app/dashboard`, `app/workflow/[id]` |
| 4. AI sidebar | Vorrex Agents system prompt + Claude call | `app/api/ai/edit-workflow/route.ts`, `components/AiSidebar.tsx` |
| 5. 24/7 execution | Push workflow to real n8n instance, activate | `app/api/workflows/[id]/deploy/route.ts` |
| 6. Security & observability | Hashed keys, RLS isolation, audit log, encrypted credentials, rate limits, structured logs, metrics, rotation metadata | `sql/*.sql`, `lib/security.ts`, `lib/observability.ts`, `lib/credentials/`, `lib/queue/worker.ts` |

## Setup

1. **Supabase**
   - Create a project at supabase.com.
   - Open SQL Editor → paste and run `sql/schema.sql`.
   - Grab your Project URL, anon key, and service_role key (Settings → API).
   - Settings → API → JWT Settings: copy the **JWT Secret** — this must match
     the `JWT_SECRET` env var below, since your custom-signed session tokens
     need to be readable by Supabase's RLS (`auth.jwt() ->> 'client_id'`).

2. **Environment variables** — copy `.env.example` to `.env.local` and fill in:
   - Supabase URL / anon key / service role key
   - `JWT_SECRET` (must equal the Supabase JWT secret from step 1)
   - `OWNER_EMAIL` + `OWNER_PASSWORD_HASH` (generate the hash with
     `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"`)
   - `GROQ_API_KEY` — powers the AI sidebar (get one at console.groq.com;
     free tier is generous). `GROQ_MODEL` defaults to `llama-3.3-70b-versatile`
     if omitted — swap it for any current Groq-hosted model.
   - `N8N_BASE_URL` + `N8N_API_KEY` — your n8n Cloud or self-hosted instance
     (Settings → API in n8n to generate a key)

3. **Install & run locally**
   ```bash
   npm install
   npm run dev
   ```
   Visit `http://localhost:3000` → redirects to `/login`.

4. **Deploy**
   - Frontend → Netlify (or Vercel, which has native Next.js support and is
     often simpler for this stack — either works).
   - n8n → self-host on Railway/Render, or use n8n Cloud, for real 24/7 execution.
   - Add all env vars from `.env.example` to your hosting provider's dashboard.

## How the pieces fit together

- **Owner login** (`/login`, owner mode) → password checked against
  `OWNER_PASSWORD_HASH` → signs a JWT with `role: "owner"`.
- **Client login** (`/login`, client mode) → email + key checked against the
  hashed key in Supabase → signs a JWT with `role: "client", client_id: ...`.
- **Every workflow request** carries that JWT. Client requests go through
  `getScopedSupabaseClient()`, which attaches the JWT as the Supabase
  `Authorization` header — Postgres RLS then enforces `client_id` matching
  at the database level, so isolation holds even if a bug slipped past the
  API layer. Owner requests go through `supabaseAdmin` (service_role),
  which bypasses RLS by design — that's the one place with full access,
  and it's never reachable from the browser directly.
- **AI sidebar**: `app/api/ai/edit-workflow/route.ts` loads the current
  `workflow_json`, sends it plus your prompt to Groq (OpenAI-compatible
  `/chat/completions`, JSON mode on) using the Vorrex Agents system prompt,
  parses the structured JSON response, saves the updated workflow, and
  logs the edit to `audit_log`.
- **Deploy to n8n**: pushes `workflow_json.nodes` / `.connections` to n8n's
  REST API and activates it — from that point the workflow runs on n8n's
  server 24/7, independent of whether anyone has this app open.

## Security notes (Phase 6, already applied)

- Special keys are never stored in plaintext — only `sha256(key)`. The
  plaintext key is returned to the Owner exactly once, at creation time.
- RLS policies scope every client query/mutation to their own `client_id`,
  enforced by Postgres itself, not just application code.
- `audit_log` records every workflow create/update/AI-edit/deploy, with
  actor type and id — useful both for debugging and for showing clients
  a history of changes.
- Auth and webhook routes now apply process-local request limits. For multi-instance production deployments, put a shared edge or Redis limiter in front of the app as well.
- Credential rotation is supported through the server-only `rotateCredential` helper. Rotation must decrypt and re-encrypt values under the new encryption key before retiring the old key.
- The builder's Run button uses the durable BullMQ endpoint and polls per-node status. The synchronous `/api/workflows/[id]/run` endpoint remains available as a debug path.
- `npm audit --omit=dev --audit-level=high` still reports transitive advisories requiring breaking upgrades to the current Next.js major. Review and schedule that major-version migration before production; the application build and tests pass on the pinned Next.js 14 stack.

## Known product-level follow-ups

- Owner login remains a single environment-backed account for simplicity; the `owners` table is available for a future multi-owner migration.
- The in-process rate limiter is intentionally safe for a single instance but should be replaced or backed by shared Redis/edge state when horizontally scaling.
- The current durable worker processes one BullMQ job per complete run. Resume-from-checkpoint after a worker crash remains a documented Phase 3 upgrade path.


## Core node catalog

Vorrex now includes the complete **1,929-entry master catalog** supplied in the inventory PDF, including the 79-node Core foundation. Core definitions are maintained in `components/node-canvas/coreNodeCatalog.ts`, the complete inventory is maintained in `components/node-canvas/fullNodeCatalog.ts`, and both are merged into `components/node-canvas/nodeDefinitions.ts` without replacing existing custom forms or full executors.

The catalog is organized into `Core` and `Triggers` groups, with stable IDs, descriptions, ports, implementation status, and image paths. To keep GitHub uploads lightweight, all catalog nodes use one shared visual asset at `public/node-icons/core.svg`, rendered in both the add-node palette and the React Flow node card; the existing icon registry still supplies each node’s distinct semantic icon and color.

Nodes with existing specialized runtime implementations keep those executors. Remaining catalog nodes are registered with safe pass-through stubs and marked as `stub` in their definition metadata; this makes the complete catalog discoverable and serializable now while allowing each operation to be upgraded incrementally without an unknown-executor failure.

The catalog verification tests assert exactly 1,929 unique inventory IDs and labels, category coverage, image metadata, and preservation of existing runnable definitions. Run `npm test`, `npm run build`, and `npm run lint` before committing changes.

## Vercel deployment

Vorrex is Vercel-ready for the Next.js web interface, API routes, authentication, Supabase operations, credentials, workflow webhooks, and synchronous workflow execution. The repository includes `vercel.json` and a non-secret health endpoint at `/api/health`.

Create a Vercel project from this repository with the default framework set to Next.js and the build command `npm run build`. Add the required values from `.env.example` in **Project Settings → Environment Variables**, especially `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `OWNER_EMAIL`, and `OWNER_PASSWORD_HASH`. Add `REDIS_URL` if the deployed API will enqueue durable runs.

After deployment, open `/api/health`. A response with `status: "ok"` confirms the core Supabase, JWT, and credential-encryption variables are present. The response intentionally reports only boolean configuration checks and never returns secret values.

Vercel serverless functions cannot host an always-running BullMQ worker or polling loop. The web/API deployment can enqueue durable jobs and receive webhooks, but `npm run worker` and `npm run triggers` must run as persistent processes on a separate worker service, container, VPS, Railway, Render, or Fly.io instance connected to the same `REDIS_URL` and Supabase project. If those processes are not deployed, use the synchronous test/run endpoint and webhook routes, but scheduled polling and queued jobs will not be processed continuously.

The project deliberately does not start workers from a Next.js route or build hook. Starting a worker inside a Vercel function would be terminated when the invocation ends and would create duplicate workers across instances.
