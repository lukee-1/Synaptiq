# Deployment runbook

## Current account state

- Supabase `wpjxohdwrwcjeunspjce` is restored and ACTIVE_HEALTHY. All five SQL migrations in this repository are applied. Keep this target; the user chose it explicitly.
- The public repository is https://github.com/lukee-1/Synaptiq. Publishing source does not deploy the application.
- Vercel is connected, but the selected team still requires a consent grant before its projects can be inspected. No project was created or deployed.
- On 19 November, the Vercel connector's team listing returned no accessible teams. Restore the intended team's access before deployment.
- FastAPI Cloud CLI is installed through `fastapi[standard]`; `whoami --json` returned `not_logged_in`. No cloud app is linked.

## Release order

1. Push this repository to the intended GitHub remote and require the `Validate Synaptiq` check before merging.
2. Run SQL tests against a staging project, then apply reviewed forward migrations. Never reset the restored project. The existing migrations have already been applied through the Supabase connector; reconcile remote migration history before using `db push` from a newly linked CLI checkout.
3. Configure the separate queue worker, local/hosted model connection and private executor. Confirm their health and run a complete evaluation before enabling production assessments.
4. Deploy the API to FastAPI Cloud, then the frontend to a Vercel preview. Complete the release checks below before routing production traffic.

## FastAPI Cloud

The app directory is `backend`; `pyproject.toml` declares `app.main:app`. `.fastapicloudignore` excludes environment files, virtualenvs, test caches and the sandbox service.

```sh
cd backend
uv run fastapi cloud whoami --json
# Interactive account setup, performed when ready to deploy:
uv run fastapi cloud auth login --no-open --json
uv run fastapi cloud teams list --json
uv run fastapi cloud apps list --team-id TEAM_ID --json
# Create/link the chosen app, then configure its environment through the platform.
uv run fastapi cloud deploy . --app-id APP_ID --json
uv run fastapi cloud deployments get DEPLOYMENT_ID --app-id APP_ID --json
```

Set `APP_ENV=production`, exact HTTPS frontend origins in `ALLOWED_ORIGINS`, Supabase URL/publishable key, and reachable service addresses. Never give the HTTP API the worker service-role secret. A process manager must run `python -m app.workers.main` separately; deployment of the HTTP app does not start it. The supplied Dockerfile can run the worker with an overridden command.

FastAPI Cloud's generated deployment workflow can be inspected with `uv run fastapi cloud ci print-workflow --json` after linking. Its CI setup creates a deploy token and GitHub secrets, so this repository contains verification CI only until an app and repository are selected.

## Vercel

Import the selected GitHub repository with **Root Directory = `frontend`**, framework Next.js, Node **24.x**, install `npm ci`, build `npm run build`. `frontend/vercel.json` contains portable project settings; root directory belongs in Vercel project configuration.

Set these for each preview/production environment:

| Name                                   | Value                           |
| -------------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Existing Supabase project's URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key only            |
| `NEXT_PUBLIC_API_URL`                  | Public HTTPS FastAPI origin     |

Rebuild after changing public variables because Next.js includes them at build time. The API CORS allowlist must match the exact preview or production origin. Do not use `*` for private authenticated traffic.

Set the Supabase site URL and allowed redirects for `/auth/callback` and `/reset` on each approved origin. GitHub OAuth additionally needs a configured GitHub OAuth application and its Supabase callback. Email confirmation/recovery require working delivery and appropriate rate limits.

## Release checks

- Fresh browser: unauthenticated `/workspace` redirects; sign in, refresh and sign out work; expired/revoked sessions fail closed.
- Two users: neither can read or modify the other's projects, runs, events or reflections. Supplied rollback SQL tests already exercise these database boundaries.
- Save source, run checks, edit again: old results remain bound to their original revision; stale writes return conflict.
- Disconnect/reconnect SSE: persisted events resume; completed results remain available. Stop a worker mid-job and verify lease recovery.
- Assessment: hidden scores stay private until submission; deadline locks edits and worker enqueues exactly one final run.
- Run actual gVisor network/filesystem/CPU isolation probes before accepting public submissions. Pin a reviewed sandbox image digest and scan it.
- Verify model guidance using representative repairs, malformed output and attempted prompt injection. Never treat an LLM opinion as executed test evidence.
- Set backup retention, event/run retention, quotas, monitoring, alerting and recovery procedures for the expected traffic. The current per-user run limiter is a baseline, not a complete abuse-prevention system.

## Advisor review

Supabase reports authenticated GraphQL schema discoverability for the ten readable public tables. This is expected with authenticated SELECT grants; row access remains constrained by tested RLS. Review [the GraphQL discoverability notice](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed) if schema names themselves must be private.

The private job table has RLS and no policies, deliberately denying direct access. Work happens only through restricted security-definer functions. See [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). These notices are recorded rather than represented as an entirely clean advisor report.

Reference: [Vercel GitHub deployment](https://vercel.com/docs/git/vercel-for-github), [FastAPI Cloud](https://fastapicloud.com/).
