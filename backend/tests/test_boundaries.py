import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.settings import Settings
from app.main import app
from app.models.contracts import CreateProject, CreateRun, SaveDraft, SourceFile
from app.models.contracts import TestResult as ExecutionResult
from app.services.catalog import private_catalog
from app.services.inference import validate_analysis

client = TestClient(app)


def test_executor_cannot_report_inconsistent_pass_counts():
    with pytest.raises(ValidationError, match="Pass count"):
        ExecutionResult(
            passed=7,
            total=7,
            visible=[{"passed": False}, {"passed": False}],
            hidden_passed=5,
            source_hash="a" * 64,
        )


def test_catalog_never_returns_answers_or_hidden_inputs():
    response = client.get("/v1/catalog")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 208
    assert len({row["family"] for row in rows}) == 44
    assert len({row["topic"] for row in rows}) == 28
    assert all(
        not {"reference", "hints", "cases", "cases_repr"} & row.keys() for row in rows
    )
    assert all(len(row.cases_repr) == 7 for row in private_catalog().values())


def test_protected_routes_require_authentication():
    for path in ("/v1/sessions", "/v1/projects", "/v1/runs", "/v1/reports"):
        assert client.get(path).status_code == 401


def test_cors_rejects_unknown_origins():
    response = client.options(
        "/v1/sessions",
        headers={
            "Origin": "https://attacker.invalid",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_chunked_oversized_body_is_rejected():
    response = client.post("/v1/inspect", content=iter([b"x" * 700000, b"x" * 700000]))
    assert response.status_code == 413


@pytest.mark.parametrize(
    "path",
    [
        "../secret.py",
        "/secret.py",
        "C:/secret.py",
        "a/../secret.py",
        "a//b.py",
        ".env",
        "keys.pem",
    ],
)
def test_project_paths_are_relative_source_files(path):
    with pytest.raises(ValidationError):
        SourceFile(path=path, source="")


def test_large_unicode_files_and_more_than_sixty_files_are_accepted():
    source = SourceFile(path="a.py", source="\u00e9" * 500000)
    project = CreateProject(
        workspace_id=uuid4(),
        name="Large project",
        files=[
            SourceFile(path=f"file-{i}.txt", source=source.source if i == 0 else "text")
            for i in range(65)
        ],
    )
    assert len(project.files) == 65
    assert len(project.files[0].source.encode()) == 1000000
    assert SourceFile(path="Dockerfile", source="FROM python:3.13")
    with pytest.raises(ValidationError, match="binary"):
        SourceFile(path="image.bin", source="\0")


def test_duplicate_project_paths_are_rejected():
    with pytest.raises(ValidationError):
        CreateProject(
            workspace_id=uuid4(),
            name="Project",
            files=[
                SourceFile(path="a.py", source=""),
                SourceFile(path="a.py", source=""),
            ],
        )


def test_coercion_and_extra_grade_fields_are_rejected():
    with pytest.raises(ValidationError):
        SaveDraft.model_validate({"revision": "1", "code": ""})
    with pytest.raises(ValidationError):
        CreateRun.model_validate(
            {"revision": 1, "idempotency_key": str(uuid4()), "passed": 7}
        )


def test_model_output_must_be_grounded_and_guidance_only():
    valid = {
        "summary": "Check the boundary",
        "findings": [{"severity": "info", "line": 1, "message": "Trace the index"}],
        "explanation": "Try the smallest interval.",
        "suggested_code": None,
    }
    assert validate_analysis(json.dumps(valid), "return a[0]").summary
    valid["suggested_code"] = "return a[1]"
    with pytest.raises(ValueError, match="complete repair"):
        validate_analysis(json.dumps(valid), "return a[0]")
    valid["suggested_code"] = None
    valid["findings"][0]["line"] = 50
    with pytest.raises(ValueError, match="nonexistent"):
        validate_analysis(json.dumps(valid), "return a[0]")


def test_production_rejects_browser_localhost_model():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            app_env="production",
            allowed_origins=["https://example.com"],
            supabase_url="https://project.supabase.co",
            supabase_publishable_key="public",
            model_name="local",
            model_base_url="http://127.0.0.1:8001/v1",
        )


def test_chunk_transport_and_abort_pass_cors_preflight():
    for method in ("PUT", "DELETE"):
        response = client.options(
            "/v1/uploads/00000000-0000-4000-8000-000000000000/parts",
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert response.status_code == 200
        assert (
            response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
        )
