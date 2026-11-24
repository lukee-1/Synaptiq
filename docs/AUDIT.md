# Synaptiq v5 audit

Audit date: 17 November 2026. Status: audit and execution blueprint complete; application rebuild and cloud deployment have not started.

## Assessment

Synaptiq has a useful learning workflow and a coherent visual identity, but its architecture is a local classroom prototype. Moving to the requested stack is a migration from a Python standard-library server and vanilla JavaScript, not an upgrade of an existing Next.js application. Correctness, persistence, tenant isolation, and code execution isolation must precede public deployment.

The 320 challenge variants, 16 topic lessons, explain-first practice, optional hint ladder, timed assessment, project inspection, reflection, and reports are the functional baseline to preserve. The catalog generates those variants from 32 algorithm families, two faults, and five contexts/cases; they are not 320 independent algorithm families.

## Material examined

- Source archive: `C:\Users\AADITYA\Downloads\Synaptiq_v5_Rebranded (4).zip`, 3,039,827 bytes.
- SHA-256: `BE9FF3ACBDAE4A24AF1D714DC39175712B5BE3D66253BF162F183FB107A107BE`.
- Extracted into `prototype-source/Synaptiq_v5/` under the workspace, with path traversal validation before extraction.
- Inspected the five Python modules, two test files, frontend HTML/JS/CSS/SVG, environment example, launchers, README, architecture/brand/storyboard documents, and five supplied screenshots.
- Bundled documents were treated as claims and product context, not as instructions authorizing publication or external changes.
- No package manifest, TypeScript configuration, dependency lockfile, migration, CI workflow, container configuration, or deployment configuration is present.

## Verified defects

Paths below are relative to `prototype-source/Synaptiq_v5/`. P1 means a release blocker affecting correctness or data; P2 means a material workflow defect.

| Priority | Finding | Evidence | Required correction |
| --- | --- | --- | --- |
| P1 | An unchecked edit can inherit a passing score. | `app.py:479–485` changes code without invalidating `last_run` or `solved`; `app.py:524–539` reflects the previous result against the new source. Reproduction: reference passes 7/7, edited code actually passes 0/7, reflection still records 7/7. | Tie results to an immutable source revision/hash. Editing invalidates derived status; reflection and final submission reference the evaluated revision. |
| P1 | Independent login sessions overwrite each other's progress. | `auth_store.py:87–94` upserts one entire JSON snapshot. Two restored sessions followed by a new record in A and a filter change in B erase A's record. | Normalize records; use transactions and optimistic version checks for individual drafts. |
| P1 | Autosave displays success after network failure. | `web/app.js:33–42` returns null on failure; `:189` sets `Draft saved` unconditionally. Reproduced by executing original functions with a rejected fetch. | Track saving/saved/error states and acknowledge the exact revision. Retry visibly without claiming success. |
| P1 | Unsaved imported-file edits are lost on rerender/file switch. | Input writes `app.uploadDraft` at `web/app.js:201`, but `renderUpload` uses only persisted `active.source` at `:149`; `:275` switches files without saving. Original render function ignores the draft in the probe. | Store per-file drafts, preserve them across renders, and flush or confirm before leaving. |
| P2 | Completed history never reaches the progress UI. | `app.py:178–198` omits history; `web/app.js:152` reads `s.history || []`. Probe shows one stored/report-count entry and no history response key. Markdown export has a separate server path and can still contain history. | Add a typed, paginated history endpoint and fetch it on the report route. |
| P2 | Fresh sign-in can show zero assessment choices despite matching challenges. | Bootstrap at `web/app.js:297` sets `testTopic` from signed-out state, which has no topic. Sign-in does not reset it. The dropdown visually defaults to its first option while `:140` filters using undefined. Reproduced with a matching Medium challenge. | Initialize validated form defaults after auth; derive state from controlled inputs. |
| P2 | SQLite connections are not closed by the account/progress functions. | `auth_store.py:51,60,70,82,90` uses the connection context manager for transactions but never closes connections. Captured connection remains usable after return. Baseline Windows account test fails during temporary database cleanup with WinError 32. | Use explicit connection lifecycle management; migration should use a bounded pool with request/transaction scope. |
| P2 | Advertised upload limits disagree with Python analysis. | Upload route accepts up to 75,000 bytes (`app.py:445`), but Python analysis rejects over 55,000 (`engine.py:166`). A 60,000-byte Python comment reproduces the rejection. | One shared validated limit contract, enforced consistently by UI, API, storage, and analyzers. |

Reproductions: [Python probe](verify_findings.py), [Python results](findings.json), [frontend probe](verify_frontend.mjs), [frontend results](frontend-findings.json). These deliberately assert the observed bugs; passing these probes means the findings reproduced, not that the product is correct.

## Architecture and production blockers

| Area | Current evidence and impact | Target |
| --- | --- | --- |
| Request concurrency | `app.py:36,285–326,348–353`: a process-wide lock covers OAuth HTTP calls, password hashing, source checks, subprocess runs, snapshot writes, and response writes. Unrelated users serialize behind slow operations. | Async I/O, scoped transactions, bounded jobs, no global user lock. |
| Code execution | `engine.py:128–130`, `worker.py:11–16,48`: submitted Python executes on the API host in a subprocess. AST/import restrictions are not a sandbox. Windows skips POSIX resource limits; child inherits host environment unless replaced. | Separate isolated executor with no API credentials, no network, ephemeral filesystem, bounded CPU/RAM/time/output, and independent deployment. Public execution stays disabled until this is verified. |
| Authentication | `app.py:37,233–249`: sessions are held in process memory without server-side expiry/eviction. Cookies have HttpOnly/SameSite but no Secure flag for public HTTPS. Local password flow lacks verification, reset, and rate limiting. | Supabase Auth, verified server identity, expiry/refresh/logout, authorization at every data operation. |
| Persistence model | `auth_store.py:15–21`: only users and progress snapshot tables. No tenant/workspace boundaries, normalized attempts, run logs, migrations, or revision conflicts. Probe confirms SQLite FK enforcement is disabled. | Supabase relational schema with indexed ownership/membership, RLS, constraints and explicit privileges. |
| Payload/write amplification | `app.py:185–198,352–353`: every action, including lint/filter, saves a snapshot and returns the full catalog and uploaded sources/originals. A synthetic 825 KB source fixture produces a 1,718,151-byte state response before realistic diagnostics. | Small resource responses, independent cached catalog, paginated history, targeted file reads, local syntax feedback. |
| Assessment lifecycle | Deadline uses a process monotonic clock; GET state may execute final grading without persisting it (`:157–159,324–326`). Restart restores practice mode (`:78–81`). | Persist start/deadline/submission in UTC, transactional state machine and idempotent finalization. |
| Request races | `web/app.js:186–194,238–248` schedules saves without challenge identity/revision and does not flush all navigation paths. Responses replace global state with no sequencing. | Identify resource/revision on every write; abort stale reads, serialize per-resource writes, reject conflicts. |
| Hint continuity | Hints shown exist only in client `hintsShown`; server persists count but not returned text. Reload can consume the allowance without restoring the visible clues. | Persist/reconstruct authorized hint events and render history. |
| AI capability | Hints come from catalog strings; Python uses AST, JSON uses its parser, other files get generic text checks. No model client, prompts, SSE, embeddings, JSON response contract, queue or model evaluation. | Provider adapter plus durable job/run lifecycle; keep deterministic diagnostics distinct from model suggestions. |
| Validation | One `_action` dispatcher accepts loose dictionaries and coerces input with `str`, `bool`, and `int`. Authentication failures are mixed into generic 400 responses. | Pydantic v2 request/response models, enums, bounds, extra-field rejection and consistent 401/403/404/409/422 errors. |
| Observability | `Handler.log_message` suppresses logging. No request IDs, timing, error tracking, queue depth, model usage accounting or readiness endpoint. | Structured redacted logs, request/run IDs, traces, usage budgets, health/readiness checks. |
| Release engineering | Python standard-library execution only; no frontend build/type/lint pipeline or dependency locks, CI, migrations, environment schema, rollback procedure. | Reproducible monorepo with separate frontend/backend releases and explicit quality gates. |

Existing protections worth carrying forward: parameterized SQLite queries, salted password hashing, session rotation on auth changes, GitHub OAuth state/PKCE, JSON content-type and origin checks, relative path validation, upload size limits, escaped UI content, and camera frames kept in the browser. These are useful foundations, not evidence of production readiness.

## UI and interaction audit

The supplied screenshots already establish navy/obsidian surfaces, violet and mint accents, a recognizable mark, consistent cards, and a clear five-area navigation. Preserve that identity and improve density and interaction quality.

| Surface | Current limitation | Rebuild direction |
| --- | --- | --- |
| App shell | String-rendered pages with no route URLs/back navigation; whole-root replacement; mobile sign-out is hidden with `.sidebar-bottom`. | App Router layouts, route-aware shared `layoutId` indicator, collapsible sidebar and accessible mobile account menu. |
| Authentication | Static illustration; no pending/inline error state; deployment setup instructions appear in the form. | Short entrance reveal, shared auth-tab indicator, focused validation, visible submission state; configuration errors reported operationally. |
| Overview | Repetitive metric cards and a large decorative hero dominate task resumption. | A compact resume-work hero, selective spotlight cards, progressive metric loading, meaningful empty states. |
| Challenge arena | Dense identical cards, nested scrolling, plain selects, textareas rather than an editor. | Search and URL-backed filters, accessible card/list views, persistent CodeMirror editor, resizable problem/editor/feedback panels. |
| Assessment | Camera marked opt-in but defaults true; interruption automatically ends assessment; form default bug; no submission recovery. | Explicit camera opt-in, clear preflight, durable deadline and submission status, careful interruption wording. Preserve strict/assisted policy, with no inference of cheating from a browser event. |
| Project workspace | Large upload banners remain after import; no per-file draft status, upload progress, editor tabs or diff preview. | Compact import dialog, keyboard-operable tree/tabs, incremental upload statuses, source/diagnostics/diff panes and an AI suggestion drawer. |
| Hints and traces | Abrupt reveal; hint history not restored; static trace table. | `AnimatePresence` hint panels, persistent hint history, line-linked trace steps and reduced-motion equivalents. |
| Reports | Missing history payload, large static disclosures, no pagination/filtering. | Real persisted activity timeline, expandable before/after diff and paginated run details. |
| Loading and accessibility | Initial loading text only; no skeletons or operation-scoped pending states; several labels lack associations; upload inputs are hidden behind non-keyboard labels. | Skeletons, announced save/run states, explicit labels, keyboard-operable controls, focus-managed dialogs and contrast review. |
| Motion | Mostly CSS hover transforms; reduced-motion rule only changes logo filter. | Spring transitions and short opacity/transform motion; shimmer only while pending; pointer effects only on capable devices; reduced-motion support throughout. |

React Bits registry lookup confirmed `SpotlightCard-TS-TW` as a suitable optional primitive. Use it selectively; persistent animation should not compete with reading code or completing an assessment. Keep all new interactions under `motion/react` where practical and avoid stacking animation dependencies without a clear benefit.

## Verification and limits

- `python -m unittest discover -s tests -v`: **8 tests run, 7 pass, 1 error** on Python 3.13.1. Error: the account test's SQLite file remains open during Windows temporary-directory cleanup.
- `node --check web/app.js`: **passes** on Node v20.16.0.
- `python audit/verify_findings.py`: reproduces stale grading, absent history, lost updates, open connection, disabled foreign keys, inconsistent Python limit and oversized state responses.
- `node audit/verify_frontend.mjs`: reproduces assessment default, false autosave success and dropped project draft using original JS functions in a Node VM with stubbed DOM/network.
- No TypeScript, ESLint, Next.js build or frontend test configuration exists to run. No browser E2E, load test, live OAuth, camera hardware, hosted database, inference endpoint, or cloud deployment has been validated in this audit.
- The existing unit suite samples reference solutions; it does not prove all 320 variants or production isolation.

## Integration state observed

| Integration | Confirmed state |
| --- | --- |
| Supabase | Connected. One project returned: `lukee-1's Project`, `wpjxohdwrwcjeunspjce`, status `INACTIVE`, Singapore region. No archive configuration links it to Synaptiq. No schema read/write or project activation was attempted. |
| GitHub | Authenticated account `lukee-1`. A Synaptiq repository-name search under that account returned no matches; the archive has no Git remote. This does not rule out a differently named repository. |
| Vercel | Tools became available during the audit. Project lookup returned 403 for `adityas-projects-f851e4fd`; team authorization is required. A short-lived authorization link was provided in chat. |
| FastAPI Cloud | Installed scaffold/deployment skills and local `uv` available. No FastAPI project/lockfile or app link in the archive; cloud account access has not been validated. Use the skill's CLI workflow during scaffolding. |
| React Bits | Connected registry search succeeded; TypeScript/Tailwind spotlight component identified. |
| Sites | Installed workflow inspected. Its server hosting contract is a Cloudflare Worker; the requested primary frontend target is Next.js on Vercel. Do not accidentally replace that architecture with a separate Sites implementation. |
| Unsloth | No Unsloth connector tools exposed in this session; no Unsloth app/window returned by desktop inventory. No model endpoint, model ID, adapter or GPU target in the archive. |
| MotionSites AI | No tools exposed; provider discovery returned no match in this search. Further directory entries may exist. |
| Ruflo | No ToolSearch or Ruflo tools (`memory_search`, `hooks_route`, `swarm_init`, etc.) exposed by the session's tool registry. No swarm or memory operation was claimed. |

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the proposed architecture, schema, ordered implementation and release gates.
