# GeMVerifier — AI-Powered Bid Compliance Verification (SIH Prototype V1)

End-to-end working prototype for **AI-powered integrated bid compliance
verification for GeM procurement**: tender/bid upload → PDF parsing → document
understanding → portal cross-verification → deterministic compliance rules →
pass / warning / fail → compliance score + risk level → officer dashboard,
audit trail and report export.

## What actually runs in V1

| SIH requirement | V1 status |
|---|---|
| Tender + multi-vendor bid upload (PDF) | ✅ Officer notice upload, vendor bid + document upload |
| PDF parsing | ✅ `pdf-parse` text extraction (scanned-image OCR is a documented V2 step) |
| AI document understanding | ✅ Heuristic field extraction (GSTIN, PAN, Udyam, turnover, EMD, experience, ISO, OEM, local content, warranty) + optional Gemini second opinion |
| Portal integration (Udyam, GSTN, PAN/ITR, EPFO/ESIC, Startup/NSIC, debarment, DigiLocker) | ✅ Deterministic **mock registries** with the production connector interface |
| Deterministic compliance rules | ✅ Threshold + mandatory-fail engine, reproducible and auditable |
| Score / risk / recommendation | ✅ 0–100 score, LOW/MEDIUM/HIGH/CRITICAL, ELIGIBLE/CONDITIONAL/NOT ELIGIBLE |
| Officer decision stays human | ✅ Complete-evaluation gate, per-item resolve, award only after completion |
| Audit trail + dashboard + report | ✅ Audit logs, dashboard counts, CSV report export |
| Database without setup | ✅ Embedded file DB (`backend/data/db.json`), zero-install |

> **Architecture note (deliberate change from the diagrams):** the sketches
> proposed FastAPI + MongoDB. The inherited codebase is Express + React, and
> V1 keeps it — rewriting the stack would have broken the working portals.
> MongoDB was replaced with an embedded file store so the demo runs anywhere
> with just Node.js. The compliance engine interface is unchanged, so a
> production swap (Mongo/Postgres, real portal APIs, Gemini) touches only the
> `backend/src/services/` and `backend/src/db/` layers.

## Quick start (3 commands)

Requirements: **Node.js 20+** only. No database, no Docker, no API keys.

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env
npm install
npm run seed     # creates demo users, tender, 3 bids + sample PDFs
npm run dev      # API on http://localhost:8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev      # UI on http://localhost:5173
```

Open http://localhost:5173 and log in (password for all: `Password123!`):

| Role | Email | Sees |
|---|---|---|
| Officer | `officer@procurement.gov.in` | Dashboard, tenders, AI verification, awards |
| Vendor (pass) | `vendor@acme.com` | Open tenders, submit bids, upload docs |
| Vendor (conditional) | `vendor2@brightline.in` | Same (missing OEM letter in demo docs) |
| Vendor (fail) | `vendor3@shadytraders.in` | Same (debarred + cancelled GST in demo data) |

## 5-minute demo script (for judges)

1. **Officer login** → open tender `GEM/2026/B/1001` (3 seeded bids already there).
2. Click **Run AI verification** → wait ~5 s → auto-opens the evaluation.
3. Show the **AI recommendation** panel: Acme 100/ELIGIBLE, Brightline
   CONDITIONAL (OEM letter), Shady NOT ELIGIBLE (debarred, CRITICAL).
4. Click a matrix cell → **evidence drawer** (exact quote, portal detail, rule).
5. **Open review queue** → resolve items → **Complete evaluation** →
   **Assign contract** to Acme.
6. **Export CSV report**; open **Vendors → Acme → portal checks**.
7. Switch role: **vendor login** → submit a bid on a new tender, upload a PDF,
   watch it appear for the officer.

## Optional: enable Gemini

```bash
# backend/.env
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.0-flash
```

With a key, every analysis adds an LLM second opinion (`mode: gemini:…`,
shown in the UI and `/health`). Deterministic verdicts always take
precedence; without a key the platform runs fully offline (`mode: heuristic`).

## Deploy

- **Backend:** any Node host (Render/Railway/VPS): `npm install && npm run seed && npm start`
  (uses `PORT`, persists `./data/db.json` + `./uploads` — attach a disk for persistence).
- **Frontend:** `npm run build`, serve `dist/` (Vercel/Netlify/Nginx) with
  `VITE_API_BASE_URL=https://<your-api>/api`.

## Repo layout

```
backend/   Express API + file DB + PDF extraction + mock portals +
           deterministic compliance engine (+ optional Gemini) + seed
frontend/  React + Vite officer & vendor portals, compliance matrix,
           evidence drawer, CSV export
```
