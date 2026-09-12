# GeM Bid Compliance API

Node.js + Express backend for the Officer Portal and Vendor Portal.

## Storage (V1)

Two modes, same API (selected by `DB_MODE`, see `src/db/models.js`):

- `DB_MODE=file` (default): embedded JSON store (`src/db/store.js`,
  persisted to `./data/db.json`) + uploads on local disk under `./uploads`.
  Zero setup — the hackathon demo path.
- `DB_MODE=supabase` (production): Postgres via `src/db/supabaseStore.js`
  (run `supabase/schema.sql` once in the Supabase SQL editor) + uploads in
  the `bid-uploads` storage bucket via `src/services/storage.js`.
  Needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. The seed script works in
  both modes (`DB_MODE=supabase npm run seed`).

## Run locally

```bash
cd backend
cp .env.example .env   # once
npm install
npm run seed           # demo users + tender + 3 bids + sample PDFs
npm run dev            # watch mode on http://localhost:8000
```

`npm start` for production. Health check: `GET /health`
returns `{ status, ai_enabled, ai_mode }`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | API port |
| `API_PREFIX` | `/api` | Route prefix |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin |
| `UPLOAD_DIR` | `./uploads` | Uploaded PDFs |
| `DB_FILE` | `./data/db.json` | Embedded DB file |
| `JWT_SECRET_KEY` | dev secret | Change in production |
| `DB_FILE` | `./data/db.json` | File-mode database path |
| `DB_MODE` | `file` | `file` = embedded store · `supabase` = cloud Postgres |
| `SUPABASE_URL` | _(empty)_ | Supabase project URL (supabase mode) |
| `SUPABASE_SERVICE_KEY` | _(empty)_ | Service/secret key, backend only (supabase mode) |
| `SUPABASE_BUCKET` | `bid-uploads` | Storage bucket (supabase mode) |
| `GEMINI_API_KEY` | _(empty)_ | Optional LLM adjudication |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Gemini model name |

## Key endpoints (all under `/api`, JWT Bearer except login)

- `POST /auth/login`, `GET /auth/me`
- Officer: `GET/POST /tenders`, `GET/PATCH /tenders/:id`,
  `POST /tenders/:id/documents` (notice PDF upload),
  `POST /evaluations` (create-or-open for a tender),
  `GET /evaluations/:id`, `POST /evaluations/:id/complete`,
  `PATCH /compliance/:id` (human resolve),
  `POST/GET /awards`, `GET /officer/dashboard`, `GET /audit-logs`,
  `GET /vendors/:id/portal-checks`
- AI pipeline: `POST /ai/evaluations/:id/analyze` (extract → portals →
  rules → persist), `GET /ai/evaluations/:id/status`,
  `POST /ai/evaluations/:id/requirements?apply=1` (tender-notice mining),
  `POST /ai/evaluations/:id/results` (external-AI bulk import)
- Reports: `GET /evaluations/:id/report`, `GET /evaluations/:id/report.csv`
- Vendor: `/vendor/profile`, `/vendor/tenders`, `/vendor/tenders/:id/bids`,
  `/vendor/bids`, `/vendor/bids/:id/documents`, `/vendor/contracts`,
  `GET /documents/:id/download`

## How verification works

`POST /ai/evaluations/:id/analyze` runs `src/services/analyze.js`:

1. Load tender, requirements, bids, vendors, uploaded documents.
2. `extract.js` — PDF/text extraction per document.
3. `complianceEngine.js` — heuristic field extraction
   (GSTIN, PAN, Udyam, turnover, EMD, experience, ISO, OEM, local content,
   warranty) + `mockPortals.js` cross-verification + deterministic
   pass/warning/fail rules, weighted 0–100 score, LOW/MEDIUM/HIGH/CRITICAL
   risk, ELIGIBLE/CONDITIONAL/NOT ELIGIBLE recommendation.
4. `gemini.js` — optional LLM layer (needs `GEMINI_API_KEY`):
   extraction second opinion per bid + **adjudication of ambiguous checks
   only** (`needs_review` → compliant/non_compliant with stored prompt,
   response, reasoning and quote). Deterministic verdicts are never
   overturned; without a key the engine runs fully offline.
5. Results persisted as `compliance_results` (including `geminiPrompt` /
   `geminiResponse` for audit); per-vendor summary stored on the
   evaluation (`overallSummary` JSON) and every step audit-logged.

`mockPortals.js` holds deterministic dummy registries matching the seed data.
To connect a real portal API later, replace the lookup inside the matching
`verify*` section — the engine and routes do not change.
