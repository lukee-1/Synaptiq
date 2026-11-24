# Synaptiq

README prose word count: 522 (excluding commands and this count).

An interactive debugging learning workspace rebuilt from the supplied Synaptiq v5 prototype. Learners diagnose a fault, repair code, inspect executed tests, and explain their reasoning. Imported projects have a conversational repair assistant with before/after comparisons and Undo.

## Status and scope

- **Implemented locally:** 44 concepts, 208 scenario exercises, timed assessments, isolated Python tests, authenticated persistence, streamed AI guidance, reversible file repairs, and downloadable notes for 28 tracks.
- **Verified:** 69 backend tests, nine frontend tests, five database suites and four real-model calibration cases pass. Browser walkthroughs cover repairs, Undo, notes downloads and assessment/reflection results. See [verification](docs/VERIFICATION.md).
- **Real services:** the signed-in workspace uses Supabase records, queued jobs, local inference and WASI execution. `/demo` is a labelled public preview with restricted persistence.
- **Unfinished:** public hosting, fresh email/recovery and GitHub OAuth account checks, wider model evaluation, load testing and a learner study. Fine-tuning, semantic retrieval and multi-file autonomous repair are planned. Imported projects receive syntax checks, not execution.

## Technology

Next.js App Router, strict TypeScript, Tailwind and Motion provide the interface. FastAPI/Pydantic validate requests. Supabase provides Auth, PostgreSQL, RLS and job storage. A Python worker calls a private Wasmtime/CPython WASI executor and a llama.cpp server using Unsloth Qwen3.5-4B GGUF locally. No paid model endpoint is required.

The evidence rating combines 60% executed code score, 20% AI diagnosis and 20% AI explanation. Hints reduce the code component. AI scores are estimates, not validated measures of mastery.

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

## AI assistance and reused material

OpenAI Codex/ChatGPT assisted with architecture, code, tests, debugging, diagrams and report drafting. Suggestions were checked through type/lint/build checks, database authorization tests, isolated execution and browser walkthroughs. Live testing exposed poor reasoning scores and duplicate login notices; these were corrected and rechecked. AI text and scores still require human judgement.

The supplied prototype contributed the product idea, original exercises and sixteen note topics; the rebuild revised and extended them. Twelve additional note topics were authored with AI assistance. Dependencies retain their own licences. Model weights are downloaded separately from official Unsloth sources. No model training is claimed.

## Documents and source archive

- [Report PDF](docs/report/Synaptiq_Project_Report.pdf), [editable report](docs/report/Synaptiq_Project_Report.docx), [report source](docs/report/report-content.json).
- [Screenshots](docs/screenshots/), [architecture figures](docs/report/), [deployment runbook](docs/DEPLOYMENT.md).
- GitHub **Code → Download ZIP** provides the source. `scripts/package-source.py` also creates a source-only ZIP for local handover. No extra assignment ZIP is necessary because all supporting material fits in the repository.
