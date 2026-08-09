# Production deployment

## 1. Create Supabase project

1. Create a Supabase project and set its Auth Site URL to the Vercel production URL.
2. Enable email confirmation and configure an SMTP provider for confirmation and password-reset emails.
3. Apply all files in `supabase/migrations/` in lexical order through the Supabase CLI or SQL editor.
4. Create the owner account through the application, then run this once in the SQL editor with the real owner email:

```sql
update public.profiles
set role = 'ADMIN'
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
| `OPENAI_API_KEY` | Server-side OCR and extraction requests | Server only |
| `OPENAI_EXTRACTION_MODEL` | Extraction model name, e.g. `gpt-5` | Server only |
| `OPENAI_OCR_MODEL` | OCR model name, e.g. `gpt-5` | Server only |
| `APP_URL` | Exact deployed URL, e.g. `https://valuerai.vercel.app` | Server only |

For Preview deployments, use a separate Supabase project and separate OpenAI project key before adding the server-only variables. Do not attach production Supabase or OpenAI credentials to Preview deployments. Set `APP_URL` to the corresponding preview URL only if email confirmation is being tested there. Do not add `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to any variable beginning with `NEXT_PUBLIC_`.

After the first deployment, set Supabase Auth **Site URL** to the production Vercel URL and add both the production URL and any required preview URLs to Supabase Auth **Redirect URLs**.

## 3. Synchronous document extraction

Applying migration `202608080006_remove_document_processing_queue.sql` removes the retired background queue. When a document upload is completed, the ValuerAI API downloads the private file, calls the OpenAI Responses API, waits for the transcription, stores the text, and returns the result in the same request. No OCR worker or separate worker host is required.

The user then selects **Run AI extraction** after all document text is ready. That request also waits for the extraction response and opens the review screen. Both OCR and extraction requests use `store: false`. Virus scanning is excluded by product decision.

## 4. Operational controls

- Set a storage lifecycle and document-retention period before allowing customer uploads.
- Schedule Postgres backups and test restore procedures.
- Configure Vercel/Supabase/OpenAI usage alerts and error monitoring.
- Use the government-source interface only with officially supported APIs or written permission; otherwise preserve the manual-entry fallback.
- Generate reports only from approved snapshots and download them through a five-minute signed URL.
