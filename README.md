# CivicLens

A community evidence platform for Bengaluru. Report pedestrian safety issues, accessibility barriers, and potholes. Review privacy edits and Gemma findings before publication.

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

Seeded issues are labelled examples, with no fabricated photos or AI results. New submissions use the real database, storage, and configured model services. The demo seed refuses to run in production.

## Services and models

Email links use Auth.js and the Drizzle adapter with PostgreSQL database sessions. Mailpit captures local email; replace the SMTP settings for deployment. Sign-up creates an account only after email verification. Public issue responses omit private account fields.

Auth.js uses a dedicated database client. Spatial and vector queries use a separate parameterized PostgreSQL client because Drizzle changes its client's JSON encoders. Migrations enable PostGIS and pgvector. The initial service area is a configurable Bengaluru demo rectangle; its production boundary and the 200-metre retrieval radius still require validation.

Local Gemma receives a metadata-free derivative with a longest edge of 512 pixels by default (`OLLAMA_IMAGE_SIZE`). Larger local requests timed out during validation. The approved storage image keeps its larger resolution. Hosted input limits are unchanged. Smaller input can lose detail; model quality still needs separate tests. The signed receipt and private audit record include the configured model-input edge limit.

The default development model path uses the installed `gemma4:12b-mlx` and `embeddinggemma-2:740m` through Ollama. Model failures are shown explicitly. No fake AI fallback is used. The embedding adapter uses 768-dimensional vectors and records its model/prefix configuration. A stored job retries failed indexing, with a bounded attempt count. Normal issue reading does not require AI availability.

The hosted Gemini adapter is implemented but has not been tested. Hosted model selection, credits, provider privacy terms, and event eligibility remain open. Do not assume that local and hosted models give the same results. Set `MODEL_PROVIDER=gemini`, a supported `GEMMA_MODEL`, and a server-only `GEMINI_API_KEY` when hosted testing is authorized. Storage hosting and change comparison also remain on hold.

Garage is local S3-compatible development storage. Its port is bound to loopback. The application serves images through visibility checks; buckets are not public websites. Keep the configurable S3 interface when choosing hosted storage. Local volumes persist data; do not remove volumes unless you intend to remove that local data.

## Privacy and reliability

Original photos, GPS parsing, face suggestions, and solid covers stay in the browser. The user approves a fresh JPEG before AI processing. File processing removes source metadata. Manual covers remain available if face suggestions fail. Detection does not certify complete privacy.

There are no server drafts. A refresh or closed tab can lose unfinished work. The analysis endpoint returns an expiring signed receipt bound to the member, approved bytes, original description, model, and findings. The final write validates the receipt and keeps the reviewed description separate from the model suggestion. Repeated submissions use idempotency keys.

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

For a live local smoke test, start the app and services, then provide a non-sensitive JPEG fixture:

```sh
TEST_IMAGE=/absolute/path/to/approved-test.jpg pnpm --filter @civiclens/backend test:smoke
```

This test uses the real local email flow, Gemma, EmbeddingGemma, PostgreSQL, and Garage. It creates a test issue, adds evidence and community actions, checks moderation access, and hides its test issue afterwards. Use the local development database only. The test email links and session cookies are not printed.

## Container build

```sh
docker build -t civiclens .
```

The application image contains the frontend build and Hono server. PostgreSQL, object storage, and the embedding runtime stay external. Run migrations before starting a deployed version. Supply all production secrets at runtime. The application refuses the default development secret in production. No hosted resource has been created.

See [WORKFLOW.md](WORKFLOW.md) for the current product decisions and remaining checks.
