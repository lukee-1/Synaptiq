# Local inference and isolated execution

## Current verified runtime

The laptop now serves [Unsloth Qwen3.5-4B GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) (`Qwen3.5-4B-UD-Q4_K_XL.gguf`, 2,912,109,728 bytes) through the official llama.cpp b12589 CPU runtime. SHA-256: `b252c5610a42ca82d20fe2a12813e9d069eed89292907e26c783eeb0bc961bc7`; model revision `e87f176479d0855a907a41277aca2f8ee7a09523`. This replaced the 2B runtime after calibration exposed inconsistent written-reasoning scores. This is local inference with Unsloth weights, not an active fine-tuning job.

- Model API: `http://127.0.0.1:8001/v1`, ID `synaptiq-local`, `MODEL_RUNTIME=openai`.
- Private key: ignored `.runtime/model.key`; matching MODEL_API_KEY in ignored backend environment.
- Loopback binding, reasoning disabled, no execution tools. Tutor requests use tool_choice=none.
- Challenge tutoring returns concise guidance without a complete solution. Project chat separately permits small exact search/replacement edits, checks uniqueness and Python/JSON syntax, then saves with revision compare-and-swap. It does not execute imported projects.
- Reasoning evaluation requests two bounded scores; the application attaches the published rubric instead of accepting free-form assertions about missing evidence. The composite rating is computed in SQL, never supplied by the client.
- Run `uv run python ../scripts/verify-learning-model.py` from backend for real-model calibration on correct, irrelevant, missing and score-manipulation answers. This is a small regression set, not a broad quality certification.
- Run `uv run python -m app.check_model --smoke` from backend for a real synthetic streaming check.

For a fresh Windows checkout, `scripts/prepare-local-model.ps1` downloads the pinned official runtime and verifies GitHub/Hugging Face asset hashes. Create a random model key locally, configure the backend environment, and use the server options in `scripts/preview.ps1`. Never commit keys. Unsloth Studio remains an alternate provider: use MODEL_RUNTIME=unsloth to disable its built-in tools explicitly.

## Worker credentials and queue

The API uses the caller's verified Supabase session. The worker uses either a service credential or a dedicated random token configured only in `backend/.runtime/worker.env` as WORKER_TOKEN. This preview uses the dedicated token. Register only its SHA-256 digest in `synaptiq_private.worker_credentials` through an authorized database administrator. The narrow token RPC checks that digest before delegating to queue operations; browser roles cannot read the credential table. Do not copy the local token into frontend configuration.

The worker has separate grading, explanation, project-chat and reasoning consumers plus an independent assessment deadline sweep. Source snapshots, optimistic revisions, leases, heartbeats, bounded retries and fencing remain enforced by Postgres. A restarted fixture job recovered and completed during live verification.

## Isolated Python execution

The separate executor on `127.0.0.1:8002` uses `EXECUTOR_BACKEND=wasi` locally. CPython 3.12 runs inside Wasmtime 50, not the host interpreter. The binary is pinned by SHA-256 in `executor/wasm.py`; install or verify it with `scripts/prepare-executor.py`.

Each candidate/reference receives its own instance with 128 MB memory, fuel and wall-clock interruption, bounded output, no preopened host directories, no inherited environment, no socket capability and no host process execution. Tests prove host-file, network and subprocess denial, absent host secrets, memory bounds and interruption of infinite loops.

Only two public cases expose input, expected/actual return values and stdout. Hidden cases expose aggregate results after assessment submission. The gateway requires EXECUTOR_TOKEN and binds to loopback. Imported projects receive syntax inspection only; arbitrary projects are never executed.

A Linux Docker/gVisor backend is retained (`EXECUTOR_BACKEND=gvisor`, sandbox_runtime=runsc). Provision and test that host before deployment; its container path has not been exercised on this Windows machine. Keep all runtimes patched and private. WASI runtime pinning is reproducibility, not a substitute for ongoing security review.

## Hosting boundary

A cloud API cannot access this laptop through localhost. Keep the queue worker with the model/executor, or provision private reachable services for a hosted worker. The current preview requires these local processes to remain running. `scripts/preview.ps1` starts the configured model, executor, API, worker and frontend after a reboot.

## Unsloth fine-tuning extension

The application currently implements inference and durable AI jobs; it does **not** claim to train models. Fine-tuning belongs in a GPU worker, separate from HTTP serving and code execution. The integration boundary is:

1. An administrator approves a versioned, permission-cleared dataset. Learner source and reflections are not automatically training data.
2. A dedicated training queue records model/base revision, dataset checksum, adapter settings, GPU requirements and cancellation state. Reuse the lease/fencing pattern, with leases and heartbeat intervals suitable for long jobs.
3. An Unsloth worker produces a versioned adapter or merged artifact in private storage; record the hash and evaluation report, not raw filesystem paths supplied by clients.
4. Evaluate schema validity, helpfulness, source leakage and challenge holdouts; explicitly promote the artifact to the inference runtime.
5. Set `MODEL_NAME` to the promoted model ID. Existing runs keep their immutable source snapshots; add model-version metadata before comparing model evaluations.

No training endpoint is exposed to ordinary learners and no GPU spending or model license acceptance occurs in this rebuild. [Unsloth documentation](https://docs.unsloth.ai/) is the integration reference.

## Vectors

Semantic retrieval is not part of the current challenge flow, so pgvector is deliberately not installed without an embedding model, dimensions and a retrieval policy. When project retrieval is added, use workspace-scoped chunks, model/version metadata, a matching dimensioned vector column, HNSW cosine index and ownership-filtered retrieval. Embedding source also requires an explicitly chosen local or hosted provider. SQL ownership rules must apply before retrieved content reaches the model.
