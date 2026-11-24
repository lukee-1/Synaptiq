import json
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.core.settings import Settings
from app.models.contracts import ChatRequest, Reflection
from app.services import assistant
from app.services.assistant import (
    ChatContext,
    ReasoningReview,
    ReasoningScores,
    ReflectionContext,
)
from app.services.patches import (
    AgentReply,
    SourceEdit,
    apply_edits,
    source_context,
    syntax_check,
)
from app.workers import learning


def edit(search: str, replacement: str) -> SourceEdit:
    return SourceEdit(search=search, replacement=replacement, reason="Fix the boundary")


@pytest.mark.parametrize("source,search,replacement,expected", [
    ("return x - 1", "x - 1", "x + 1", "return x + 1"),
    ("café = 1\n", "café", "count", "count = 1\n"),
    ("x=1\r\ny=2", "x=1", "x=3", "x=3\r\ny=2"),
    ("# unused\nx=1", "# unused\n", "", "x=1"),
    ("x=1", "x=1", "x=1", "x=1"),
])
def test_exact_patch_preserves_other_source(source, search, replacement, expected):
    assert apply_edits(source, [edit(search, replacement)]) == expected


@pytest.mark.parametrize("source,search,replacement", [
    ("x=1", "missing", "x=2"),
    ("x=1\nx=1", "x=1", "x=2"),
    ("x=1", "x=1", "\0"),
    ("x = 1", "x=1", "x=2"),
])
def test_unsafe_or_ambiguous_patch_is_rejected(source, search, replacement):
    with pytest.raises(ValueError):
        apply_edits(source, [edit(search, replacement)])


def test_sequential_edits_and_atomic_failure():
    assert apply_edits("x=1", [edit("x=1", "x=2"), edit("x=2", "x=3")]) == "x=3"
    original = "x=1"
    with pytest.raises(ValueError):
        apply_edits(original, [edit("x=1", "x=2"), edit("missing", "x=3")])
    assert original == "x=1"


@pytest.mark.parametrize("path,source", [("a.py", "def f(:"), ("a.JSON", '{"x":}'), ("a.py", "x = \0")])
def test_invalid_syntax_is_not_applied(path, source):
    with pytest.raises(ValueError):
        syntax_check(path, source)


@pytest.mark.parametrize("path,source,notice", [
    ("a.py", "raise RuntimeError('must not execute')", "not been executed"),
    ("a.json", '{"ok":true}', "JSON syntax checked"),
    ("a.ts", "const x = 1;", "needs its own build"),
])
def test_validation_never_executes_uploaded_code(path, source, notice):
    assert notice in syntax_check(path, source)


@pytest.mark.parametrize("source,question,budget", [("a"*20000,"fix",14000), ("x=1\n"*6000+"target_name=0\n","target_name",14000), ("é\n"*10000,"é",400)])
def test_context_is_bounded_without_mutating_source(source, question, budget):
    excerpt, truncated = source_context(source, question, budget)
    assert truncated and len(excerpt) <= budget and excerpt in source


def test_small_source_is_available_in_full():
    assert source_context("x=1", "fix") == ("x=1", False)


@pytest.mark.parametrize("change", [{"message":"  "},{"revision":True},{"auto_apply":"true"},{"revision":0},{"confidence":5}])
def test_chat_request_rejects_invalid_or_extra_fields(change):
    values = dict(file_id=uuid4(), revision=1, message="Fix the boundary", auto_apply=True, idempotency_key=uuid4())
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(values | change)


def test_reflection_cannot_supply_its_own_score():
    with pytest.raises(ValidationError):
        Reflection.model_validate(dict(run_id=uuid4(), explanation="This includes the final item.", confidence=5))


@pytest.mark.parametrize("value", [-1, 6, float("nan"), float("inf")])
def test_reasoning_score_must_be_finite_and_in_range(value):
    with pytest.raises(ValidationError):
        ReasoningReview(diagnosis_score=value, explanation_score=3, feedback="Check the boundary")


def chat_context():
    return ChatContext(turn_id=str(uuid4()), lease_token=str(uuid4()), path="a.py", source="x=1", message="Set x to 2", history=[])


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["valid", "ambiguous", "syntax", "question", "unchanged"])
async def test_repair_requires_an_exact_valid_change(monkeypatch, kind):
    replacements = {"valid": [edit("x=1","x=2")], "ambiguous": [edit("missing","x=2")], "syntax": [edit("x=1","x=")], "question": [], "unchanged": [edit("x=1","x=1")]}
    async def reply(*args):
        return AgentReply(message="Review this change.", edits=replacements[kind])
    monkeypatch.setattr(assistant,"structured_reply",reply)
    result,candidate = await assistant.repair(Settings(_env_file=None),chat_context())
    assert result["validated"] is (kind == "valid")
    assert candidate == ("x=2" if kind == "valid" else None)


@pytest.mark.asyncio
async def test_blank_diagnosis_gets_zero_even_if_model_awards_points(monkeypatch):
    async def reply(*args):
        return ReasoningScores(diagnosis_score=5,explanation_score=4)
    monkeypatch.setattr(assistant,"structured_reply",reply)
    context=ReflectionContext(run_id=str(uuid4()),lease_token=str(uuid4()),version=1,source="x=1",diagnosis="  ",explanation="The boundary includes the last item.",code_score=5,challenge_id="INT-01-1-1")
    assert (await assistant.review_reasoning(Settings(_env_file=None),context)).diagnosis_score == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("runtime", ["openai","unsloth"])
async def test_structured_assistant_stream_disables_host_tools(monkeypatch,runtime):
    async def handle(request):
        body=json.loads(request.content)
        assert body["tool_choice"] == "none"
        assert body["response_format"]["json_schema"]["strict"] is True
        if runtime == "unsloth":
            assert body["enable_tools"] is False and body["run_tools_locally"] is False
        reply=json.dumps({"message":"Already correct","edits":[]})
        events="".join("data: "+json.dumps({"choices":[{"delta":{"content":part}}]})+"\n\n" for part in [reply[:8],reply[8:]])
        return httpx.Response(200,text=events+"data: [DONE]\n\n")
    original=httpx.AsyncClient
    monkeypatch.setattr(assistant.httpx,"AsyncClient",lambda **kwargs: original(transport=httpx.MockTransport(handle)))
    reply=await assistant.structured_reply(Settings(_env_file=None,model_name="fixture",model_runtime=runtime),"Help",{},AgentReply)
    assert reply.message == "Already correct" and reply.edits == []


@pytest.mark.asyncio
async def test_worker_preserves_source_on_model_failure(monkeypatch):
    async def broken(*args):
        raise RuntimeError("secret provider payload")
    monkeypatch.setattr(learning,"repair",broken)
    calls=[]
    class Queue:
        async def call(self,action,data):
            calls.append((action,data))
            return {"ok":True}
    await learning.process_learning("chat",chat_context().model_dump(mode="json"),Queue(),Settings(_env_file=None))
    assert [action for action,_ in calls] == ["chat_fail"]
    assert "secret provider payload" not in str(calls)
