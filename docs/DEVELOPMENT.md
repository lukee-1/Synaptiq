# Development record

Prepared 24 November 2026. These stages describe observed local work, not an invented sequence of historical commits. The supplied ZIP remains outside this repository.

| Stage | Change and reason | Evidence |
| --- | --- | --- |
| Audit | Identified static presentation and missing persistence, execution and model connections. | [Audit](AUDIT.md), [blueprint](EXECUTION_PLAN.md). |
| Rebuild | Next.js/TypeScript, FastAPI contracts, Auth/RLS, immutable run snapshots and durable queues prevent arbitrary grade writes and cross-owner access. | Backend checks; access and queue SQL suites. |
| Practice and assessments | Consolidated repeated cards into concepts with scenario selection; added timed setup, public/hidden tests and deadline submission. | Catalog baseline: 2,912 executions; live assessment. |
| Imports and help | Removed arbitrary app-level import quotas, added chunk staging and skip reports; fixed first-click clues and tutoring. | Upload SQL suite, 65-file/1.2 MB fixture, browser clue check. |
| Execution and inference | Configured WASI isolation, local Unsloth inference and separate consumers so model latency does not block deadlines. | Isolation probes, worker recovery, independent-lane tests. |
| Project assistant | Added selected-file conversation, exact edits, syntax validation, revision conflicts, automatic/manual apply and Undo. Imported projects cannot execute. | Patch/API tests, assistant SQL suite, browser repair and Undo. |
| Notes and reflection | Added 28 note topics and downloads; replaced selectable confidence with code and written-reasoning scores; fixed explanation submission. | Nine frontend tests; positive/negative live reflection cases. |
| Quality corrections | The 2B model misgraded reasoning and followed score demands. Replaced it with verified Qwen3.5-4B, bounded JSON scores and application-owned rubric feedback. Fixed duplicated login notices and unwanted redirects. | Four model calibration cases; production build and browser checks. |
| Packaging | Added a concise README, source-only archive, system diagram and illustrated report. Credentials and runtime files are excluded. | Verification record, publication scan and rendered report review. |

## Decisions that changed

- User feedback replaced self-selected confidence with a system-generated rating that includes written reasoning. The 60/20/20 weighting is a design choice, not a validated psychometric scale.
- The preview now runs model and executor services locally; public hosting remains separate work.
- Project inspection expanded into reversible selected-file repairs. Multi-file planning and execution remain outside the developed scope.
- Assignment 1 proposed comparing explanation-first assistance with immediate correction and testing delayed transfer. This project implements interactions for a future study; it has not conducted that experiment.

## AI use and review

Codex/ChatGPT generated and revised code, tests, figures and prose. Compilation was insufficient evidence: actual queue/executor runs, authorization fixtures, model calibration and browser interactions revealed additional flaws. The report draws on the supplied Assignment 1 literature and checked primary sources. No tutor feedback or classroom outcomes were invented. The author should review the report and be able to explain the decisions before submission.
