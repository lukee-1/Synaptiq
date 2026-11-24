"""Execute every reference and starter in the actual WASI sandbox."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from executor.wasm import run  # noqa: E402

rows = json.loads((ROOT / "backend/app/data/challenges.json").read_text(encoding="utf-8"))
module = str(ROOT / "backend/.runtime/python.wasm")
failures = []
for index, row in enumerate(rows):
    try:
        expected = json.loads(run(row["reference"], row["cases_repr"], module))["results"]
        try:
            actual = json.loads(run(row["code"], row["cases_repr"], module))["results"]
        except RuntimeError:
            # Infinite-loop bugs are expected starter failures, provided the reference passed.
            actual = [{"ok": False, "result": None}] * 7
        if not all(case["ok"] for case in expected):
            failures.append({"id": row["id"], "issue": "reference", "cases": expected})
        elif all(a["ok"] and a["result"] == b["result"] for a,b in zip(actual, expected, strict=True)):
            failures.append({"id": row["id"], "issue": "starter passes every check"})
    except Exception as error:
        failures.append({"id": row["id"], "issue": type(error).__name__ + ": " + str(error)})
    if (index + 1) % 20 == 0:
        print(f"Checked {index + 1}/{len(rows)}, failures: {len(failures)}", flush=True)
report = {"scenarios": len(rows), "executed_cases": len(rows) * 14, "failures": failures}
(ROOT / "backend/.runtime/catalog-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2), flush=True)
raise SystemExit(bool(failures))
