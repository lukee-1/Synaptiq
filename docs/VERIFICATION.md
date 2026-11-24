# Verification record — 24 November 2026

The configured local application is working and has been exercised through the browser. This is not certification of public-production readiness or learning effectiveness.

## Current results

| Phase | Result and evidence |
| --- | --- |
| Backend | 69 tests pass; Ruff and strict mypy pass. Includes actual WASI isolation, patch validation, API contracts, worker error handling and reasoning boundaries. |
| Frontend | 9 tests pass across SSE, uploads and all learning notes. Strict TypeScript, ESLint and final production Next.js build pass. |
| Database | Five forward migrations applied. Five reversible SQL suites pass: access, queue, uploads, lanes and assistant. Covers ownership, direct-write denial, stale leases, repair conflicts, Undo, reasoning version fencing and weighted ratings. |
| Local model | Four real Qwen3.5-4B calibration cases pass: correct, irrelevant, missing diagnosis and score-manipulation inputs. This small regression set is not broad model validation. |
| Project assistant | Real file import and conversation produced a syntax-checked repair; automatic apply saved revision 2, Undo restored revision 3, manual apply saved revision 4. Before/after source matched the changes. These repair clicks used the prior 2B runtime; the 4B replacement was verified for scoring and streaming separately. |
| Assessment | Corrected prefix-sum attempt passed 2 public checks during work, then 7/7 after submission. Written reflection persisted; rating 4.80/5 comprised code 5, diagnosis 4 and explanation 5. Reload retained evidence; submitted timer state was checked. |
| Negative reasoning | Correct Unicode code passed 7/7 after one clue. Irrelevant diagnosis/explanation each scored 0, yielding 2.88/5 from code score 4.8. |
| Notes | Search/view worked. Downloaded one Unicode note and all 28 notes; file contents and topic counts were checked. |
| Auth interface | Account dialog and sign-out control visible. Signup and login forms remain accessible when already signed in; duplicate notices and unintended redirects were corrected. No new real confirmation/recovery email or OAuth completion was performed. |
| Browser diagnostics | No JavaScript errors observed in the checked assessment session. This is not a comprehensive cross-browser/accessibility audit. |

78 automated backend/frontend cases exceed the requested 50 checks. SQL suites, model calibration and browser walkthroughs are additional evidence, not silently counted as repetitions of those 78 cases.

## Flaws found and fixed in this round

- Explanation submission depended on the wrong save path; it now submits a run-bound reflection independently and displays errors inline.
- User-selected confidence was inappropriate for the requested automatic score. Server-side code evidence and independent written-reasoning scores now form the rating.
- Project imports lacked conversational repair and accessible notes. Added bounded selected-file edits, before/after views, revision-safe apply/Undo and downloads.
- The 2B model misgraded sound explanations and followed score demands. Upgraded to checksum-verified 4B weights, constrained scoring output and used application-owned rubric descriptions. Remaining judgement uncertainty is visible.
- Chat polling could overlap and pagination could skip older messages. Polling is sequential/cancellable and history offsets reflect loaded records.
- Auth events could hide login/signup by redirecting an already signed-in user. Restricted continuation redirects and removed duplicate signed-in notices.
- Assessment countdown remained visually active after submission; it now displays Submitted. Overview counts now derive from the catalog.

## Prior baseline evidence

[The earlier verification record](VERIFICATION_BASELINE.md) contains 2,912 catalog reference/starter executions, worker restart recovery, automatic deadline submission and upload fixtures (65 files and 1.2 MB Unicode source). Those checks passed in the previous repair phase; the full catalog was not rerun in this feature round. The baseline's 2B model and unavailable-browser statements are historical and superseded above.

## Remaining release work

- Fresh email confirmation, recovery and GitHub OAuth require account-level end-to-end checks.
- Public hosting needs reachable model/executor/worker services, production origins and secrets. A cloud API cannot call this laptop's localhost.
- Wider model quality/prompt-injection evaluation, real learner usability/transfer research, load testing, backup recovery and monitoring are not completed.
- Windows uses WASI. The optional Linux gVisor path has not been executed here.
- Imported-file repairs are not runtime-tested. The assistant sees a bounded selected-file excerpt, not an entire repository.
- Supabase leaked-password protection and other production advisories in the baseline need account review before hosting.

## Reproduce and inspect

Commands are in AGENTS.md, SETUP.md and AI_RUNTIME.md. The configured machine starts with `./scripts/preview.ps1`; visit http://127.0.0.1:3000/workspace. Screenshots in `docs/screenshots` show actual browser states. The source package excludes secrets, dependencies, runtime binaries, model weights and user records.
