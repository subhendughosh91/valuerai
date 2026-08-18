# Production deployment

## 1. Create Supabase project

1. Create a Supabase project and set its Auth Site URL to the Vercel production URL.
2. Enable email confirmation and configure an SMTP provider for confirmation and password-reset emails.
3. Apply all files in `supabase/migrations/` in lexical order through the Supabase CLI or SQL editor.
4. Create the owner account through the application, then run this once in the SQL editor with the real owner email:

```sql
update public.profiles
set role = 'ADMIN', state_code = null
where id = (select id from auth.users where email = 'owner@example.com');
```

Do not expose the service-role key to the browser. Supabase Row Level Security is the access-control boundary; retain it on every application table and private bucket.

## 2. Configure Vercel

Connect the GitHub repository to a new Vercel project. Vercel will detect Next.js automatically; no `vercel.json` is required. Keep the default build command (`pnpm build`) and install command (`pnpm install --frozen-lockfile`).

Add these environment variables in **Vercel → Project Settings → Environment Variables** for **Production**.

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public browser configuration |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | Public browser configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side private storage and report operations | Server only |
| `OPENAI_API_KEY` | Server-side OpenAI requests | Server only |
| `OPENAI_DOCUMENT_MODEL` | JPEG/PDF reading and faithful transcription; `gpt-5.5` | Server only |
| `OPENAI_EXTRACTION_MODEL` | Structured field extraction; `gpt-5.5` | Server only |
| `OPENAI_DOCUMENT_REASONING_EFFORT` | Document-reading effort; `low` for standard models, `medium` for Pro | Server only |
| `OPENAI_EXTRACTION_REASONING_EFFORT` | Structured-extraction effort; `low` for standard models, `medium` for Pro | Server only |
| `OPENAI_NORMALIZATION_MODEL` | Date, name, identifier, currency, and area formatting; `gpt-5-mini` | Server only |
| `OPENAI_VALUATION_MODEL` | Land-rule and valuation reasoning; `gpt-5.5` | Server only |
| `OPENAI_CHAT_MODEL` | Property chat answers; optional, defaults to `OPENAI_VALUATION_MODEL` | Server only |
| `OPENAI_CONSISTENCY_MODEL` | Cost-sensitive contradiction and completeness checks; `gpt-5-nano` | Server only |
| `OPENAI_BACKGROUND_EXTRACTION_ENABLED` | Rollout switch; start with `false`, then set `true` after webhook configuration | Server only |
| `OPENAI_WEBHOOK_SECRET` | Signing secret supplied by the OpenAI webhook configuration | Server only |
| `APP_URL` | Exact deployed URL, e.g. `https://valuerai.vercel.app` | Server only |

For Preview deployments, use a separate Supabase project and separate OpenAI project key before adding the server-only variables. Do not attach production Supabase or OpenAI credentials to Preview deployments. Set `APP_URL` to the corresponding preview URL only if email confirmation is being tested there. Do not add `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to any variable beginning with `NEXT_PUBLIC_`.

After the first deployment, set Supabase Auth **Site URL** to the production Vercel URL and add both the production URL and any required preview URLs to Supabase Auth **Redirect URLs**.

## 3. Background document extraction

Applying migration `202608080006_remove_document_processing_queue.sql` removes the retired background queue. Uploading a document only stores it in private Supabase Storage and records its metadata; it does not call OpenAI.

After the mandatory Sale Deed is present, the user selects **Start Valuation**. With `OPENAI_BACKGROUND_EXTRACTION_ENABLED=true`, the route creates a durable database run, submits a maximum of two document-reading Responses concurrently, and returns `202` immediately. OpenAI response events are received at `https://<production-domain>/api/openai/webhook`; the UI also reconciles progress through `/api/valuations/:id/extraction-status` every three seconds while visible. Completed OCR text is reused on retry. Structured extraction runs only after every document transcription completes, followed by the existing parallel normalisation and consistency checks.

OpenAI requests retain `store: false`; background results are retrieved only during OpenAI's temporary background-response availability window. No separately hosted OCR worker is required. Monetary arithmetic and the Word report remain deterministic application code. Virus scanning remains excluded by product decision.

Create an OpenAI webhook for the exact production URL, subscribe to `response.completed`, `response.failed`, `response.incomplete`, and `response.cancelled`, then place its signing secret in `OPENAI_WEBHOOK_SECRET`. Apply migration `20260810180631_openai_background_extraction.sql` before enabling the flag. Deploy first with the flag disabled, configure and verify the webhook, enable it with GPT-5.1 for one acceptance run, and only then change the document and extraction models to GPT-5.2 or GPT-5.5.

The existing synchronous extraction implementation remains available while the rollout flag is `false`. Do not remove it until production acceptance testing is complete.

## 4. Operational controls

- Set a storage lifecycle and document-retention period before allowing customer uploads.
- Schedule Postgres backups and test restore procedures.
- Configure Vercel/Supabase/OpenAI usage alerts and error monitoring.
- Use the government-source interface only with officially supported APIs or written permission; otherwise preserve the manual-entry fallback.
- Generate reports only from approved snapshots and download them through a five-minute signed URL.
