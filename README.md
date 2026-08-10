# ValuerAI

Tripura property-valuation application with a runnable frontend and production Supabase/OpenAI backend foundation.

## Run locally

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The health endpoint is available at `/api/health`.

## Included in this slice

- Responsive User/Admin entry page with India-only registration and Tripura launch gating.
- User valuation dashboard; supported document categories; extraction confirmation, editing, re-upload and report states.
- Admin workspace seeded with Tripura extraction rules, valuation rules and shared land rules.
- Deterministic land-value calculation preview and SBI-style report sections based on the supplied sample report.

## Production integration boundary

The workspace now includes Supabase migrations, RLS, private storage buckets, server APIs, OpenAI Background Responses with signed webhook reconciliation, deterministic valuation, rule publication, and Word report generation. Add the production credentials from `.env.example`, apply the migrations, and configure the OpenAI webhook before deployment. No separately hosted OCR worker is required. See [deployment instructions](docs/DEPLOYMENT.md).
