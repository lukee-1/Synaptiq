# Demonstration guide

Open http://127.0.0.1:3000/workspace on the configured computer. This remains a local service when viewed in the in-app browser. Keep web, API, worker, model and executor running. For another computer, follow [setup](SETUP.md).

## Repair a file

1. Sign in, open **My projects** and import a UTF-8 Python file containing `def add(a, b): return a - b`.
2. Select it and **Ask assistant**: “add(7, 3) should return 10 but returns 4. Fix the operator.”
3. Leave automatic apply checked, send and wait. Inspect the before/after comparison and syntax validation message.
4. **Undo** restores the original as a new revision. Uncheck automatic apply and request the correction again to inspect a proposal before applying it.

Syntax validation does not prove correctness. Imported projects are never executed. Large-file model context is a bounded excerpt; import itself has no arbitrary app-level count/size quota.

## Diagnose and explain

1. In **Challenge arena**, choose a concept and scenario. Write the suspected cause, edit and run checks.
2. Use **Reveal a clue** or **Explore with AI** if needed. Inspect public input/output evidence.
3. Explain why the repair works and **Submit explanation**. Wait for the separate code, diagnosis and explanation scores.
4. In **Assessments**, two public cases are visible during the timed attempt; five hidden cases count after final submission. The deadline submits the last saved revision.

The verified prefix-sum example passed 7/7 with a 4.80/5 composite. A Unicode negative example passed 7/7 after one clue, but irrelevant written answers scored zero each, producing 2.88/5. Future model calls need not produce identical scores.

## Keep notes

Open **Learning notes**, search “Unicode” and read its invariant, pitfalls and practice steps. Download one note or all 28 as Markdown. Notes do not contain hidden test fixtures.

## Authentication

Guest navigation exposes **Log in** and **Sign up**. Signed-in navigation exposes **Account** and **Sign out**. `/signup` opens registration. Fresh email confirmation/recovery and GitHub OAuth still require account-level verification before public hosting.

See [verification](VERIFICATION.md) and [deployment](DEPLOYMENT.md) for remaining checks. This guide does not deploy or submit the assignment.
