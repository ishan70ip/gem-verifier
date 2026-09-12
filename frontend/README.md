# GeM Verifier — Frontend (React + Vite)

Officer portal (dashboard, tenders, AI evaluation + compliance matrix,
evidence drawer, awards) and vendor portal (open tenders, bid submission,
document upload, contracts).

## Run locally

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxies /api to localhost:8000)
```

The dev server proxies `/api` to the backend, so no env file is needed
locally. For production builds against a remote API:

```bash
VITE_API_BASE_URL=https://<your-api-host>/api npm run build
npm run preview  # preview the dist/ output
```

## Demo logins (password for all: `Password123!`)

- Officer: `officer@procurement.gov.in`
- Vendors: `vendor@acme.com`, `vendor2@brightline.in`, `vendor3@shadytraders.in`

## Key screens

- `/` officer dashboard · `/tenders` tender list · `/tenders/new` create tender
- `/tenders/:id` tender detail — **Run AI verification**, notice-PDF upload
- `/evaluations/:id` evaluation — AI recommendations, compliance matrix,
  review queue, CSV report export, complete → award flow
- `/vendors`, `/vendors/:id` vendor profiles + portal checks
- `/vendor/dashboard` vendor workspace (bids + document upload)
