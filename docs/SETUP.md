# Local setup

A debugging learning workspace rebuilt from Synaptiq v5. It provides 44 unique concepts, 208 scenario exercises, 28 tracks, staged hints, timed assessments, project imports and reflection workflow, with a Next.js interface and FastAPI/Supabase architecture.

## Run locally

Requirements: Node 24, Python 3.13 and uv. The UI and API run without a GPU; model feedback and code execution remain unavailable until their services are configured.

```sh
npm ci
npm --prefix frontend ci
cd backend
uv sync --locked
```

Copy `frontend/.env.example` to `.env.local` and `backend/.env.example` to `.env`. Set the project URL and publishable key. This workspace already has ignored local files configured for the restored Supabase project. A dedicated worker token is configured locally in ignored runtime storage.

In separate terminals:

```sh
# repository root
npm --prefix frontend run dev
# backend directory
uv run fastapi dev
# backend directory, after supplying worker credentials
uv run python -m app.workers.main
```

Open [the preview](http://127.0.0.1:3000/demo), or sign in at [the workspace login](http://127.0.0.1:3000/login). Add `http://127.0.0.1:3000/auth/callback` and `http://127.0.0.1:3000/reset` to Supabase's redirect allowlist. Configure GitHub OAuth in Supabase if using that login method.

Global Node on the current Windows machine is 20.16. Use Node 24 for installs and scripts; an exact local runtime is installed under `node_modules/node/bin/node.exe`. Do not run installs with Node 20, which skips newer optional native dependencies.

On this Windows workspace, use the helper from the repository root so child processes also use Node 24:

```powershell
.\scripts\web.ps1 -Action dev
# Other actions: check, build, start (start requires a completed build)
```

The local preview now uses a verified Unsloth Qwen3.5-4B GGUF served by llama.cpp on port 8001 and a WASI Python executor on port 8002. Start the complete configured preview after a reboot with `./scripts/preview.ps1`. Local model files, keys and logs are excluded from the source archive.

The source archive requires its own environment setup: run `scripts/prepare-executor.py`, and on Windows `scripts/prepare-local-model.ps1` to obtain the pinned runtime and model. Configure model/executor keys and register a scoped worker token as described in `docs/AI_RUNTIME.md`.

## What is implemented

- Project coding assistant with exact before/after edits, automatic or manual apply, revision conflict protection and Undo.
- Viewable, searchable and downloadable learning notes for all 28 tracks.
- Automatic evidence rating: 60% verified code score, 20% AI-assessed diagnosis and 20% AI-assessed final explanation.
- Responsive obsidian/violet/mint workspace, animated navigation and cards, dialog focus containment, reduced-motion support and skeletons.
- CodeMirror editing, explicit revision saves, draft buffers, challenge filters, server-timed assessment policy and source-aware run history.
- Email/password, email confirmation, recovery and GitHub OAuth integration. Protected server routes and backend token verification.
- PostgreSQL ownership and membership tables, project files/revisions, sessions, runs/events and reflections. RLS plus restricted write RPCs.
- Durable database queue with leases, recovery, bounded retries, cancellation, immutable inputs and automatic assessment submission.
- OpenAI-compatible streaming model adapter with structured feedback validation. Backend SSE uses persisted events and resumable cursors.
- Separate WASI/gVisor executor gateway. Submitted code runs inside the isolated runtime.
- OpenAPI-generated TypeScript contracts, lint/type/build checks, regression tests and GitHub Actions CI.

## Verification and deployment

See [verification evidence](docs/VERIFICATION.md), [deployment setup](docs/DEPLOYMENT.md), [AI and execution services](docs/AI_RUNTIME.md), and [engineering conventions](AGENTS.md).

Five migrations are applied to the existing Supabase project. The local preview has working inference, isolated code execution, queued repairs and reasoning evaluation. The application is **not publicly deployed**. Fresh email confirmation/recovery and GitHub OAuth still need account-level testing; hosted model, worker, executor, production origins and monitoring remain release work. See the dated verification report for the exact checks and limitations.

The [original audit](docs/AUDIT.md) and [upgrade blueprint](docs/EXECUTION_PLAN.md) are included in this repository; raw audit evidence remains in the parent `audit/` directory.
