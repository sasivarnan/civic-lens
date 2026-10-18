# CivicLens

A community evidence platform for Bengaluru. Report pedestrian safety issues, accessibility barriers, and potholes. Review privacy edits and Gemma findings before publication.

## Hackathon track: Gemma 4 multimodal intelligence

**Primary problem statement: Track 1 — Best Use of Gemma 4, G3. Multimodal AI Intelligence.**

CivicLens combines a photo with the resident's text description. Gemma 4 compares these inputs to identify visible conditions, separate observations from claims, identify conflicts, and explain uncertainty. The resident reviews the findings and approves the final report before publication.

The demo must show reasoning across both inputs. For example, a resident can describe a path as completely blocked while the photo shows only part of the path. Gemma should explain what the photo supports and what it cannot establish. This is an example to demonstrate; it is not a claim that every model response is correct.

Image and text are the input formats for this MVP. Audio is not required by the supplied G3 statement. EmbeddingGemma supports related-report retrieval after location filtering. Gemma 4's comparison of the photo and description is the core G3 use case.

## Product principle: invisible utility

**The best use of artificial intelligence is invisible utility.**

This principle guides the interface. It does not replace the G3 problem statement.

CivicLens puts useful help inside one civic reporting task. Residents prepare a safe photo, review the evidence, find related reports, and share a report with next steps. They do not need a separate chatbot or AI tool.

Gemma 4 compares the photo with the resident description. EmbeddingGemma connects related reports after location filtering. The interface leads with the task and its result. Model details belong in the technical documentation and privacy information.

Invisible utility does not mean hidden processing. Label AI suggestions, explain uncertainty, and require human approval before publication. Keep privacy checks, insufficient-evidence results, and service failures visible. AI does not verify an incident or promise government action.

## Development record

The hackathon development window is 13-18 October 2026. This project uses AI coding assistance. Design decisions and local validation results are recorded in `WORKFLOW.md`.

Project-wide Git tracking started on 15 October 2026. The first project commits group existing local work by area; they do not represent the time when each feature was written. No commit dates were changed. The `frontend-scaffold` branch preserves the generated frontend starter commit from 15 October 2026. Later work is committed after checks pass.

## Workspace

- `apps/frontend`: React, Vite, TanStack Router, XState Store, Tailwind, and shadcn/ui.
- `apps/backend`: Hono on Node.js, Auth.js, Drizzle, PostgreSQL, and Effect v4.
- `packages/shared`: request schemas, public types, and fixed action guides.
- `infra`: local PostgreSQL with PostGIS/pgvector and Garage storage settings.

The frontend uses the requested [shadcn preset](https://ui.shadcn.com/create?preset=b27GcrRo): Base UI Rhea, neutral colours, Inter, and Lucide. Package versions are fixed by `pnpm-lock.yaml`.

## Run locally

Requirements: Node.js 22.12 or later, PNPM 12.4.1, and a running Docker-compatible engine. The installed local Ollama models are used only when you request AI review or retrieval.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm services:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:5173>. The backend runs on port 3000. The local test mailbox is at <http://localhost:8025>. Setup creates an ignored `.env` with generated local secrets and downloads the face model and WASM files. It does not replace an existing `.env`.

Sign in with `reporter@civiclens.test` or `community@civiclens.test`. Open the email in the local mailbox and follow its verification link. The seed command also creates an Admin account for local moderation testing. There is no password or user-switch bypass. All demo account addresses and roles are in `apps/backend/src/seed.ts`.

For temporary hackathon access, set `DEMO_MODE=true` in the backend environment and restart the backend. Visitors receive separate 24-hour demo sessions without email sign-in. New demo issues have a demo label. Privacy checks, evidence review, and final approval still apply. Admin actions require a real email session with the admin role; use `/sign-in`. The default is `false`. Set it back to `false` and restart to stop demo access. This does not delete stored demo reports or images. Use a separate demo database.

Seeded issues are labelled examples, with no fabricated photos or AI results. New submissions use the real database, storage, and configured model services. The demo seed refuses to run in production.

## Services and models

Email links use Auth.js and the Drizzle adapter with PostgreSQL database sessions. Mailpit captures local email; replace the SMTP settings for deployment. Sign-up creates an account only after email verification. Public issue responses omit private account fields.

Auth.js uses a dedicated database client. Spatial and vector queries use a separate parameterized PostgreSQL client because Drizzle changes its client's JSON encoders. Migrations enable PostGIS and pgvector. The initial service area is a configurable Bengaluru demo rectangle; its production boundary and the 200-metre retrieval radius still require validation.

Local Gemma receives a metadata-free derivative with a longest edge of 512 pixels by default (`OLLAMA_IMAGE_SIZE`). Larger local requests timed out during validation. The approved storage image keeps its larger resolution. Hosted input limits are unchanged. Smaller input can lose detail; model quality still needs separate tests. The signed receipt and private audit record include the configured model-input edge limit.

The default development model path uses the installed `gemma4:12b-mlx` and `embeddinggemma-2:740m` through Ollama. Model failures are shown explicitly. No fake AI fallback is used. The embedding adapter uses 768-dimensional vectors and records its model/prefix configuration. A stored job retries failed indexing, with a bounded attempt count. Normal issue reading does not require AI availability.

Hosted validation on 17 October 2026 used `gemma-4-26b-a4b-it` after a key replacement. A full local API check and a real mobile-browser submission passed. A later API repeat failed during blank-image review, so sustained reliability is not established. The adapter retries HTTP 500, 502, 503, or 504 once within its original time limit. A hosted HTTP 429 is returned as a separate service-limit error and is not retried. Invalid output, billing, permissions, and quota errors fail safely. No model fallback is used. Mocked tests cover request privacy, bounded retries, strict output validation, and safe errors. Keep `GEMINI_API_KEY` server-only in the ignored `.env`. Provider privacy review, event eligibility, public deployment, and broader image quality remain open.

Garage is local S3-compatible development storage. Its port is bound to loopback. The application serves images through visibility checks; buckets are not public websites. Keep the configurable S3 interface when choosing hosted storage. Local volumes persist data; do not remove volumes unless you intend to remove that local data.

## Privacy and reliability

Original photos, GPS parsing, face suggestions, and solid covers stay in the browser. The user approves a fresh JPEG before AI processing. File processing removes source metadata. Manual covers remain available if face suggestions fail. Detection does not certify complete privacy.

There are no server drafts. A refresh or closed tab can lose unfinished work. Insufficient evidence has no category and cannot be published. Replace the image and run review again. Earlier stored AI reviews have no recorded evidence assessment. For sufficient civic context, the analysis endpoint returns an expiring signed receipt bound to the member, approved bytes, original description, model, and findings. The final write validates the receipt and keeps the reviewed description separate from the model suggestion. Repeated submissions use idempotency keys.

Support and dated observations are separate records. Admin visibility controls do not establish resolution. Hidden issue images stop being served through the application. Previously downloaded images or PDFs cannot be revoked.

Before any public deployment, complete retention/deletion policy, production SMTP, secrets, database and object backups, model privacy review, distributed rate limiting if replicas are added, and manual accessibility testing. Local request limits are process-local. Image upload is limited to 8 MB and 20 megapixels.

OpenStreetMap tiles require attribution and caching. There is no offline prefetch, autocomplete, or external place search. The map/list and coordinate fields remain separate. Fixed action guides cite official sources, describe their verification limits, and do not submit government complaints.

## Checks

```sh
pnpm check:unused
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The unused-code check uses Knip across the workspace, including exported entry-point declarations. Backend and shared TypeScript checks reject unused declarations. MediaPipe asset setup stays in the frontend workspace that owns its dependency.

Privacy tests also check stale exports, withdrawn review, encoder failures, metadata removal before AI/storage, orientation, solid covers, and input limits.

Editor component tests check photo replacement, GPS removal, manual-coordinate confirmation, and invalid files. The print component test checks complete history, evidence, AI limits, sources, and the print command. These tests use a simulated browser environment. They do not confirm an actual PDF file or physical-device behaviour.

The backend tests check signed receipts, tampering, expiry, cross-origin writes, unauthenticated submission, validation, and API fallbacks.

For a live local smoke test, start the app and services, then use the included CC0 reference image. Its source and usage limits are in `fixtures/README.md`:

```sh
TEST_IMAGE="$PWD/fixtures/road-damage.jpg" pnpm --filter @civiclens/backend test:smoke
```

This test uses the real local email flow, the configured Gemma provider, EmbeddingGemma, PostgreSQL, and Garage. It checks that blank input has no publication receipt and that a valid analysis receipt names the configured model. It creates a test issue, adds evidence and community actions, checks moderation access, and hides its test issue afterwards. For hosted Gemma, the runner waits five seconds before each review, including the first. Set `TEST_AI_GAP_MS` from 5000 to 900000 to increase this wait. Run one live test process at a time. This delay does not establish compliance with a project quota and does not pace browser requests or the adapter's single server-error retry. Normal automated tests use mocked provider responses. Use the local development database only. The test email links and session cookies are not printed.

## Container build

```sh
docker build -t civiclens .
```

The application image contains the frontend build and Hono server. PostgreSQL, object storage, and the embedding runtime stay external. Run migrations before starting a deployed version. Supply all production secrets at runtime. The application refuses the default development secret in production. No hosted resource has been created.

See [WORKFLOW.md](WORKFLOW.md) for the current product decisions and remaining checks.
