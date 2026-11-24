# Deployment runbook

## Selected deployment

The public source is [lukee-1/Synaptiq](https://github.com/lukee-1/Synaptiq). The existing Supabase project `wpjxohdwrwcjeunspjce` has all five migrations applied. Do not reset it.

The selected arrangement hosts Next.js and FastAPI together on Vercel. The laptop continues running the model, isolated executor and queue worker. Jobs travel through Supabase; no public laptop tunnel is used. The laptop must stay awake, online and running `scripts/preview.ps1` for AI guidance, repairs, reasoning ratings and code tests. Queued work is not evidence that the worker is online.

[Vercel Services](https://vercel.com/docs/services) is currently beta. Import this repository with **Root Directory = repository root**, Node **24.x**. Root `vercel.json` builds `frontend` and `backend` separately. `/v1/*` and `/health` go to FastAPI; all other paths go to Next.js. Deployments and rollbacks keep both components together. `frontend/vercel.json` remains useful for a standalone frontend deployment.

## Environment

Use the following project variables for production and each intended preview:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing project's HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key only |
| `SUPABASE_URL` | Same project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Same publishable key |
| `APP_ENV` | `production` |
| `WORKER_MODE` | `external` |
| `ALLOWED_ORIGINS` | JSON array containing the exact HTTPS frontend origin |

Omit `NEXT_PUBLIC_API_URL` for same-origin routing. Set it to `http://127.0.0.1:8000` only for separate local development. Leave `NEXT_PUBLIC_SITE_URL` unset on Vercel so callbacks use the request origin. Do not copy local worker, model or executor credentials, or a Supabase secret/service-role key, into the hosted API. It operates with each caller's verified Supabase token.

Keep the laptop worker's `WORKER_MODE=local`, existing private inference/executor URLs and scoped worker credential. External mode on the hosted API advertises configured queue capabilities; it does not assert worker liveness. The Settings screen explains this distinction.

Rebuild after changing public variables. Add the production `/auth/callback` and `/reset` URLs to Supabase Authentication URL Configuration, preserving approved local callbacks. Set Site URL to the production origin. GitHub OAuth requires its own provider configuration; do not present it as tested until completed.

## Verification and rollback

1. Require the GitHub `Validate Synaptiq` workflow. It includes contracts, typing, lint, backend/frontend tests, sandbox/catalog execution and a production frontend build.
2. Confirm hosted `/health`, catalog, login/signup, unauthenticated workspace redirect and invalid-token denial.
3. With the laptop worker running, sign in, import a fixture, request a repair, apply/Undo it, run a challenge and submit written reasoning. Verify persisted results after refresh.
4. Exercise email confirmation/recovery on the production origin; verify that no callback redirects to localhost.
5. Keep migration history forward-only. Roll back application deployments through Vercel; never reset user data as a rollback strategy.

Current verification and remaining gaps are recorded in [VERIFICATION.md](VERIFICATION.md). This is a demonstration deployment, not a claim of unattended availability or validated learning outcomes. Wider model evaluation, load/abuse testing, backups/recovery and monitoring remain release work.

## Optional separate hosting

FastAPI Cloud can deploy `backend` using its declared `app.main:app` entrypoint. The frontend then needs the API HTTPS URL and exact CORS configuration. No FastAPI Cloud deployment has been created. A future always-on worker/model/executor needs separately provisioned compute; an HTTP deployment alone does not supply it.

## Database advisor context

Authenticated GraphQL schema discoverability for readable tables is expected with authenticated SELECT grants; row ownership is constrained by tested RLS. Private job tables deliberately deny direct access and use restricted functions. Review account-level password protection and backup settings before broad public use. See [Supabase's GraphQL notice](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed) and [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
