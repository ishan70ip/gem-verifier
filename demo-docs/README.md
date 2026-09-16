# Demo documents (ready to upload through the UI)

Regenerate anytime: `node src/scripts/make-demo-docs.js` (from `backend/`).

| File | Upload as | What it proves |
|---|---|---|
| `Brightline-OEM-MAF.pdf` | Vendor `vendor2@brightline.in` → their bid → *Upload New Bid Document* (category: OEM Warranty Letter) | Brightline's only gap is the missing OEM letter. After uploading, officer re-runs verification → Brightline flips **CONDITIONAL → ELIGIBLE**. The perfect human-in-the-loop demo arc. |
| `Tender-Notice-GEM-2026-B-1001.pdf` | Officer → tender `GEM/2026/B/1001` → *Upload notice PDF* | Tender-notice parsing: EMD / turnover / experience thresholds get extracted from the notice text. |
| `Sample-Weak-Bid.pdf` | Create a **new** tender first (officer → New evaluation), then login as any vendor → submit bid → upload this | Free-play: thin bid with no ISO/OEM, low turnover — watch the engine flag it. |

Seeded bid PDFs (already in the system, no upload needed) live in
`backend/uploads/` and are covered by `npm run seed`.

## Styled certificate pack (`cert-pack/`)

11 government-styled PDFs (PAN cards, GST certificates, Udyam certificates,
ISO certificate, OEM letter, Startup certificate) — authentic layout, real
text layers, data matched to the mock portal registry. Attached to the seeded
bids with:

```bash
cd backend
node src/scripts/attach-doc-pack.js   # idempotent, then restart the backend
node src/scripts/make-doc-pack.js     # regenerate the PDFs themselves
```

Verification scores are unchanged with the pack attached (Acme 100 ELIGIBLE,
Brightline CONDITIONAL on the missing OEM letter, Shady NOT ELIGIBLE) —
proven by re-running analysis after attaching.
