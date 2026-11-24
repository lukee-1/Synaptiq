# Verification record — 23 November 2026

This is a working local review build, not a claim that public production deployment has been completed.

## Results

| Phase | Verified result |
| --- | --- |
| Frontend | Strict TypeScript, ESLint, six tests (SSE parsing and source chunking), production Next.js build pass. |
| Backend | Ruff and strict mypy pass. Thirty tests pass, including actual WASI isolation, wrong/correct code, syntax errors, stdout, CORS and auth denial. |
| Catalog | 44 concepts, 208 distinct scenario exercises, 28 tracks. All 2,912 reference/starter case executions checked. Every reference passes; every starter has a failing case or bounded execution failure. |
| Database | Four forward migrations applied to the existing project. Access, queue, upload and independent-lane SQL suites pass with rollback fixtures. |
| Uploads | 65 files and a 1.2 MB Unicode source persisted in rollback tests. Chunk retries, revision conflicts, ownership and anonymous denial pass. No app-level file-count/file-size quota remains; infrastructure and available memory still impose practical bounds. |
| Real queue/executor | Deliberately wrong code completed with 0/7. Corrected code completed with 7/7, expected/actual values and stdout. |
| Real assessment | A deadline-expired fixture was automatically submitted and graded 7/7, completed 3.53 seconds after its simulated deadline. |
| Real AI | Verified Unsloth Qwen3.5-2B GGUF running locally through llama.cpp. Real streaming schema smoke test passes. A durable queued explanation completed with validated feedback. |
| Recovery | Restarted the worker during a fixture job; the expired lease was reclaimed and the job completed. |
| HTTP preview | Challenge and assessment pages return 200. Protected workspace redirects to login. Invalid callback routes back to a useful login error. |

The SQL scripts are `supabase/tests/access.sql`, `queue.sql`, `uploads.sql`, and `lanes.sql`. Isolated runtime probes are `backend/tests/test_executor.py`; full fixture verification is `scripts/verify-catalog.py`.

## Flaws found and corrected

- Assessments reused the practice grid: replaced with dedicated setup, assistance policy, attempt history, resume/review and timed editor autosave.
- One concept appeared repeatedly: consolidated into concept cards with scenario selection and different task contracts/code; added 12 concepts and 12 tracks.
- Five inherited starters passed every fixture: strengthened two-pointer/rotated-search edge cases and replaced ineffective shared-list bugs with observable mutations.
- Three intentionally looping starters were initially misclassified by the catalog verifier: it now distinguishes a bounded starter failure from a failing reference.
- Upload caps existed in UI, API and SQL: replaced with chunk staging, atomic completion and explicit skipped/failed file reporting. Added plain text and extensionless source support.
- CORS omitted PUT/DELETE: allowed the authenticated transport methods and added regression coverage.
- First-click practice actions could start a session without completing the action: session creation is awaited and edited buffers remain mounted.
- Hints had an unexplained diagnosis gate: removed it while preserving assessment assistance policy.
- Test execution lacked a configured runtime and worker: installed and verified capability-isolated WASI execution with a scoped queue token.
- AI had no active model; overly long output could fail validation: installed verified local weights and constrained concise structured feedback.
- Tutoring could stall grading/deadline processing: separated grading and explanation consumers and added an independent deadline sweep.
- Callback origin could switch from 127.0.0.1 to localhost: added canonical NEXT_PUBLIC_SITE_URL, token-hash verification, useful errors, resend and original-window continuation.

## What still requires user review / deployment work

- Browser-control tools became unavailable during this repair. Current pages were checked over HTTP, but the rebuilt signed-in browser journeys and mobile visuals have not been independently clicked through. Earlier screenshots predate these repairs.
- The user reported saving the Supabase Site URL and callback/reset allowlist. A fresh confirmation email, password recovery and GitHub OAuth still need real-account testing. Existing old confirmation links may be expired; use a fresh message.
- Local inference is CPU-based; model correctness and teaching quality require broader evaluation. No paid model provider is used. Fine-tuning and vector retrieval remain documented extension boundaries.
- Public GitHub/Vercel/FastAPI Cloud deployment, hosted secrets, production auth origins, backup recovery, load testing and operational monitoring remain release work. The local model/executor/worker must be kept running for this preview.
- Supabase advisory review reports private tables intentionally protected by RLS with no client policies, authenticated GraphQL schema discoverability (row access remains RLS-protected), intentionally exposed token/ownership-checked SECURITY DEFINER RPCs, and leaked-password protection disabled in the account. Review these account/production settings before public release.

## Restart and artifacts

Use `./scripts/preview.ps1` from the repository root to start the configured preview after a reboot. Open http://127.0.0.1:3000/workspace. Logs and PID files are in ignored `backend/.runtime/`.

`Synaptiq_Rebuilt_Source.zip` contains source and setup instructions only; model weights, environments, local tokens, build output and dependencies are excluded.

Advisory references: [private RLS tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [GraphQL schema discoverability](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed), [token RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated upload RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The RPC warnings are intentional; invalid tokens, anonymous uploads, and cross-user access were tested and rejected.
