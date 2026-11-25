# Synaptiq

An interactive debugging learning workspace rebuilt from the supplied Synaptiq v5 prototype. Learners diagnose a fault, repair code, inspect executed tests, and explain their reasoning. Imported projects have a conversational repair assistant with before/after comparisons and Undo.

## Status and scope

- **Implemented locally:** 44 concepts, 208 scenario exercises (40 Easy, 146 Medium, 22 Hard, each with three staged clues), timed assessments with two public and five hidden test cases, isolated Python tests, authenticated persistence, streamed AI guidance, reversible file repairs, and downloadable notes for 28 tracks.
- **Verified:** on a clean checkout, 16 frontend cases and 63 of 71 backend tests pass; the other eight are sandbox-isolation tests that need the pinned WASI runtime. Five database suites and four real-model calibration cases also pass. Browser walkthroughs cover repairs, Undo, notes downloads and assessment/reflection results. See [verification](docs/VERIFICATION.md).
- **Real services:** the signed-in workspace uses Supabase records, queued jobs, local inference and WASI execution. `/demo` is a labelled public preview with restricted persistence.
- **Unfinished:** public hosting, fresh email/recovery and GitHub OAuth account checks, wider model evaluation, load testing and a learner study. Fine-tuning, semantic retrieval and multi-file autonomous repair are planned. Imported projects receive syntax checks, not execution.

## Technology

Next.js App Router, strict TypeScript, Tailwind and Motion provide the interface. FastAPI/Pydantic validate requests and stream status over server-sent events. Supabase provides Auth, PostgreSQL, RLS and job storage. A Python worker, with separate lanes for grading, tutoring, repair and reasoning scores, calls a private Wasmtime/CPython WASI executor.

The evidence rating combines 60% executed code score, 20% AI diagnosis and 20% AI explanation, and is calculated in SQL. Clues reduce the code component. The weighting is a design choice, and AI scores are estimates, not validated measures of mastery.

## Run or inspect

Requirements: Node 24, Python 3.13, uv and your own Supabase configuration.

```sh
npm ci
npm --prefix frontend ci
cd backend
uv sync --locked
```

Copy the frontend and backend `.env.example` files to `.env.local` and `.env` respectively. Supply your own values; **never commit keys**. Apply the five ordered migrations to your project. Configure worker, model and executor using [setup](docs/SETUP.md) and [runtime instructions](docs/AI_RUNTIME.md). Do not reset an existing database.

```sh
# Separate terminals after configuration
npm --prefix frontend run dev
cd backend
uv run fastapi dev
uv run python -m app.workers.main
```

The configured Windows workspace restarts all five services with `./scripts/preview.ps1` after a frontend build. Open [local workspace](http://127.0.0.1:3000/workspace) or [signup](http://127.0.0.1:3000/signup). Follow the [demonstration guide](docs/DEMO_GUIDE.md), or inspect screenshots without running services.

## Development record

The [development record](docs/DEVELOPMENT.md) groups significant changes, reasons and checks: prototype audit; authenticated API/database; separate practice/assessment flows; execution and inference; assistant, notes and evidence ratings. It records the unreliable 2B scoring model and its replacement. The first source commit consolidates earlier local work, rather than claiming an invented historical commit sequence.

## Development, verification, and reused material

The system architecture, design decisions and technical documentation were developed by me for this rebuild, including replacing learner-selected confidence with the evidence rating.All generated output was vetted through static type-checking, linting, production builds, database authorisation test suites, isolated execution and end-to-end browser walkthroughs. Live integration testing exposed degraded reasoning scores and duplicate authentication notifications, and root-cause analysis led to targeted fixes and regression checks across the affected flows. I reviewed the results and am responsible for the content.

The baseline prototype provided the initial product specification, core exercises and sixteen foundational note topics, which were refactored and expanded during the rebuild; the remaining twelve of the 28 note topics were added in this rebuild. All third-party packages remain governed by their respective licences, and model weights are retrieved directly from official Unsloth distributions with no custom model training performed or claimed.

## Documents and source archive

- [Report PDF](docs/report/Synaptiq_Project_Report.pdf) and [report source](docs/report/report-content.json).
- [Screenshots](docs/screenshots/), [deployment runbook](docs/DEPLOYMENT.md).
- GitHub **Code → Download ZIP** provides the source. `scripts/package-source.py` also creates a source-only ZIP for local handover. No extra assignment ZIP is necessary because all supporting material fits in the repository.
