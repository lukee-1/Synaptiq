"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Lightbulb,
  Play,
  Save,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { catalog, concepts, scenarioName, tracks } from "@/lib/catalog";
import { api } from "@/lib/api";
import {
  analysisSchema,
  runSchema,
  scoreSchema,
  sessionSchema,
} from "@/lib/contracts";
import type { Challenge, Run, Session } from "@/lib/contracts";
import { readEvents } from "@/lib/sse";
import { browserClient } from "@/lib/supabase/client";
import { publicEnvironment } from "@/lib/env";
import { useWorkspace } from "./workspace-provider";
import { Button, Empty, Modal, Reveal, SectionHeading, Spotlight } from "./ui";
import { ReflectionPanel } from "./reflection-panel";
import { CodeEditor } from "./code-editor";

export function Challenges() {
  const store = useWorkspace();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All tracks");
  const [selected, setSelected] = useState<Challenge | null>(
    () => catalog.find((row) => row.id === params.get("challenge")) ?? null,
  );
  const [active, setActive] = useState<Session | null>(null);
  const [family, setFamily] = useState("");
  const [limit, setLimit] = useState(18);
  const filtered = concepts.filter(
    (concept) =>
      (topic === "All tracks" || concept.scenarios[0].topic === topic) &&
      `${concept.family} ${concept.scenarios[0].topic}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function start(): Promise<Session | null> {
    if (!store.workspace || !selected) return null;
    const existing = store.sessions.find(
      (row) =>
        row.challenge_id === selected.id &&
        row.mode === "practice" &&
        row.status === "active",
    );
    const session =
      existing ??
      (await api("/sessions", sessionSchema, {
        method: "POST",
        body: {
          workspace_id: store.workspace.id,
          challenge_id: selected.id,
          mode: "practice",
          assistance: true,
        },
      }));
    store.updateSession(session);
    setActive(session);
    return session;
  }
  if (selected)
    return (
      <Practice
        key={selected.id}
        challenge={selected}
        session={
          active ??
          store.sessions.find(
            (row) =>
              row.challenge_id === selected.id &&
              row.mode === "practice" &&
              row.status === "active",
          ) ??
          null
        }
        assessment={false}
        start={start}
        back={() => {
          setSelected(null);
          setActive(null);
        }}
      />
    );
  return (
    <>
      <Reveal>
        <div className="page-heading">
          <div>
            <div className="eyebrow">MAKE ROOM FOR A LITTLE CURIOSITY</div>
            <h1>Find your next breakthrough.</h1>
            <p>
              {concepts.length} concepts across {tracks.length} tracks. Choose a
              scenario inside each concept.
            </p>
          </div>
          <span className="badge">
            <span className="mint-dot" />
            {catalog.length} scenario exercises
          </span>
        </div>
      </Reveal>
      <div className="filters panel">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search challenges"
            placeholder="Search a concept or track..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(18);
            }}
          />
        </label>
        <select
          aria-label="Learning track"
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            setLimit(18);
          }}
        >
          <option>All tracks</option>
          {tracks.map((track) => (
            <option key={track}>{track}</option>
          ))}
        </select>
      </div>
      <div className="results-label">
        <span>{filtered.length} unique concepts</span>
        <span>EXPLAIN · EXPERIMENT · REFLECT</span>
      </div>
      <div className="challenge-grid">
        <AnimatePresence mode="popLayout">
          {filtered.slice(0, limit).map((concept) => (
            <motion.div
              layout
              key={concept.family}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Spotlight className="challenge-card">
                <div className="card-eyebrow">
                  <span className="difficulty medium">
                    {concept.scenarios[0].difficulty}
                  </span>
                  <span>{concept.scenarios.length} scenarios</span>
                </div>
                <h3>{concept.family}</h3>
                <p>{concept.scenarios[0].topic}</p>
                <div className="challenge-card-footer">
                  <span>One concept. Different problems.</span>
                  <button
                    className="round-button"
                    aria-label={`Choose scenario: ${concept.family}`}
                    onClick={() => setFamily(concept.family)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </Spotlight>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!filtered.length && (
        <Empty title="Try another angle">
          Search another concept or reset your track filter.
        </Empty>
      )}
      {filtered.length > limit && (
        <div className="center">
          <Button variant="secondary" onClick={() => setLimit(limit + 18)}>
            Explore more concepts <ChevronRight size={16} />
          </Button>
        </div>
      )}
      <Modal open={!!family} close={() => setFamily("")} title={family}>
        <p className="muted">
          Choose the problem context. Each scenario has its own code, contract,
          and checks.
        </p>
        <div className="scenario-options">
          {catalog
            .filter((row) => row.family === family)
            .map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  setSelected(row);
                  setActive(null);
                  setFamily("");
                }}
              >
                <b>{scenarioName(row.name)}</b>
                <span>{row.description}</span>
                <ArrowUpRight size={16} />
              </button>
            ))}
        </div>
      </Modal>
    </>
  );
}

export function Practice({
  challenge,
  session,
  back,
  start,
  assessment,
}: {
  challenge: Challenge;
  session: Session | null;
  back: () => void;
  start: () => Promise<Session | null>;
  assessment: boolean;
}) {
  const store = useWorkspace();
  const [current, setCurrent] = useState(session);
  const draftId = session?.id ?? challenge.id;
  const [code, setCode] = useState(
    store.drafts[draftId] ?? session?.code ?? challenge.code,
  );
  const [diagnosis, setDiagnosis] = useState(
    store.drafts[draftId + ":diagnosis"] ?? session?.diagnosis ?? "",
  );
  const [busy, setBusy] = useState("");
  const [run, setRun] = useState<Run | null>(
    () => store.runs.find((item) => item.session_id === session?.id) ?? null,
  );
  const [gate, setGate] = useState(false);
  const [remaining, setRemaining] = useState(300);
  const [notice, setNotice] = useState("");
  const [streamText, setStreamText] = useState("");
  const { refresh, setError } = store;
  const runId = run?.id;
  const runStatus = run?.status;
  const dirty =
    !!current && (code !== current.code || diagnosis !== current.diagnosis);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!current?.deadline || current.status === "submitted") return;
    const tick = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (new Date(current.deadline ?? "").getTime() - Date.now()) / 1000,
          ),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [current?.deadline, current?.status]);
  useEffect(() => {
    if (!runId || !runStatus || !["queued", "running"].includes(runStatus))
      return;
    const controller = new AbortController();
    const watch = async () => {
      const env = publicEnvironment();
      if (!env.success) return;
      let cursor = "0";
      try {
        while (!controller.signal.aborted) {
          const { data } = await browserClient().auth.getSession();
          if (!data.session) throw new Error("Sign in again to reconnect");
          const response = await fetch(
            `${env.data.apiUrl}/v1/runs/${runId}/events?after=${cursor}`,
            {
              signal: controller.signal,
              headers: { Authorization: `Bearer ${data.session.access_token}` },
            },
          );
          if (!response.ok || !response.body)
            throw new Error("Could not connect to run updates");
          for await (const event of readEvents(response.body)) {
            if (event.id) cursor = event.id;
            if (event.event === "delta") {
              const delta = z
                .object({ text: z.string() })
                .safeParse(JSON.parse(event.data));
              if (delta.success)
                setStreamText((previous) =>
                  (previous + delta.data.text).slice(-60000),
                );
            }
            if (event.event === "state") {
              const state = runSchema.parse(JSON.parse(event.data));
              setRun(state);
              void refresh();
              return;
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "Connection lost");
      }
    };
    void watch();
    return () => controller.abort();
  }, [runId, runStatus, refresh, setError]);
  async function save(): Promise<Session | null> {
    let latest = current;
    if (!latest) {
      if (store.preview) {
        setGate(true);
        return null;
      }
      latest = await start();
      if (!latest) return null;
      setCurrent(latest);
    }
    if (code === latest.code && diagnosis === latest.diagnosis) return latest;
    const saved = await api(`/sessions/${latest.id}`, sessionSchema, {
      method: "PATCH",
      body: { revision: latest.revision, code, diagnosis },
    });
    setCurrent(saved);
    store.updateSession(saved);
    return saved;
  }
  useEffect(() => {
    if (
      !assessment ||
      !current ||
      current.status !== "active" ||
      !dirty ||
      busy ||
      remaining === 0
    )
      return;
    const timer = setTimeout(() => {
      setBusy("autosave");
      void api(`/sessions/${current.id}`, sessionSchema, {
        method: "PATCH",
        body: { revision: current.revision, code, diagnosis },
      })
        .then((saved) => {
          setCurrent(saved);
          store.updateSession(saved);
        })
        .catch((error: unknown) =>
          setError(
            error instanceof Error
              ? error.message
              : "Autosave failed; save your changes again",
          ),
        )
        .finally(() => setBusy(""));
    }, 400);
    return () => clearTimeout(timer);
  }, [
    assessment,
    current,
    dirty,
    busy,
    remaining,
    code,
    diagnosis,
    store,
    setError,
  ]);
  useEffect(() => {
    if (
      !assessment ||
      !current ||
      remaining > 0 ||
      current.status === "submitted"
    )
      return;
    const timer = setInterval(() => {
      void api(`/sessions/${current.id}`, sessionSchema)
        .then(async (latest) => {
          if (latest.status === "submitted") {
            setCurrent(latest);
            store.updateSession(latest);
            const runs = await api(
              `/runs?session_id=${latest.id}`,
              z.array(runSchema),
            );
            setRun(runs.find((item) => item.operation === "submit") ?? null);
            void refresh();
          }
        })
        .catch((error: unknown) =>
          setError(
            error instanceof Error
              ? error.message
              : "Could not retrieve assessment submission",
          ),
        );
    }, 2000);
    return () => clearInterval(timer);
  }, [assessment, current, remaining, refresh, setError, store]);

  async function action(
    kind: "save" | "hint" | "test" | "submit" | "explain",
  ) {
    if (store.preview) {
      setGate(true);
      return;
    }
    setBusy(kind);
    setNotice("");
    setStreamText("");
    try {
      const saved = await save();
      if (!saved) return;
      if (kind === "save") {
        setNotice("Revision saved.");
        return;
      }
      if (kind === "hint") {
        const updated = await api(
          `/sessions/${saved.id}/hints`,
          sessionSchema,
          { method: "POST" },
        );
        setCurrent(updated);
        store.updateSession(updated);
        return;
      }
      const created = await api(`/sessions/${saved.id}/runs`, runSchema, {
        method: "POST",
        body: {
          operation: kind,
          revision: saved.revision,
          idempotency_key: crypto.randomUUID(),
        },
      });
      setRun(created);
      if (kind === "submit") {
        const submitted = { ...saved, status: "submitted" as const };
        setCurrent(submitted);
        store.updateSession(submitted);
      }
    } catch (error) {
      store.setError(
        error instanceof Error ? error.message : "Operation failed",
      );
    } finally {
      setBusy("");
    }
  }
  const score = scoreSchema.safeParse(run?.result);
  const analysis = analysisSchema.safeParse(run?.result);
  const running = !!run && ["queued", "running"].includes(run.status);
  return (
    <>
      <button className="back-link" onClick={back}>
        <ArrowLeft size={15} /> Back to{" "}
        {assessment ? "assessments" : "challenges"}
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{challenge.topic}</div>
          <h1>{challenge.family}</h1>
          <p>{challenge.name.split(" · ")[1]}</p>
        </div>
        {current?.status === "submitted" ? <span className="badge">Submitted</span> : current?.deadline ? (
          <span className={"timer " + (remaining < 45 ? "urgent" : "")}>
            <Clock3 size={17} />
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </span>
        ) : (
          <span className={"difficulty " + challenge.difficulty.toLowerCase()}>
            {challenge.difficulty}
          </span>
        )}
      </div>
      {!current && !store.preview && (
        <div className="info-callout">
          Open a session to save your progress.{" "}
          <Button busy={!!busy} onClick={() => void action("save")}>
            Start {assessment ? "assessment" : "practice"}
          </Button>
        </div>
      )}
      {assessment && remaining === 0 && current?.status === "active" && (
        <p className="info-callout" role="status">
          Time is up. The server is submitting your last saved revision.
        </p>
      )}
      <div className="practice-layout">
        <div className="practice-main">
          <section className="panel problem-panel">
            <div className="eyebrow">THE CHALLENGE</div>
            <p>{challenge.description}</p>
            {
              <>
                <label className="field-label" htmlFor="diagnosis">
                  01 / What do you think is happening?
                </label>
                <textarea
                  id="diagnosis"
                  disabled={assessment && (remaining === 0 || current?.status === "submitted")}
                  rows={3}
                  value={diagnosis}
                  onChange={(event) => {
                    setDiagnosis(event.target.value);
                    store.setDraft(draftId + ":diagnosis", event.target.value);
                  }}
                  placeholder="I suspect the issue is… because…"
                  maxLength={3000}
                />
              </>
            }
          </section>
          <section className="editor-panel">
            <div className="editor-tabs">
              <span>
                <i className="mint-dot" /> solution.py
              </span>
              <span>
                Python <span className="editor-separator">/</span>{" "}
                {current ? `Revision ${current.revision}` : "Starter code"}
              </span>
            </div>
            <CodeEditor
              code={code}
              onChange={(value) => {
                setCode(value);
                store.setDraft(draftId, value);
              }}
              readOnly={
                current?.status === "submitted" ||
                (assessment && remaining === 0)
              }
            />
            <div className="editor-actions">
              <span className={dirty ? "unsaved" : "muted"}>
                {dirty
                  ? "● Unsaved changes"
                  : store.preview
                    ? "Preview buffer"
                    : current
                      ? "Saved source"
                      : "Starter code"}
                {current?.status === "submitted" ? " · Submitted" : ""}
              </span>
              <div>
                <Button
                  variant="ghost"
                  busy={busy === "save"}
                  disabled={
                    !!busy ||
                    current?.status === "submitted" ||
                    (assessment && remaining === 0)
                  }
                  onClick={() => void action("save")}
                >
                  <Save size={14} /> Save
                </Button>
                <Button
                  busy={busy === "test"}
                  disabled={
                    !!busy || running || current?.status === "submitted"
                  }
                  onClick={() => void action("test")}
                >
                  <Play size={14} /> Run checks
                </Button>
              </div>
            </div>
          </section>
          {notice && (
            <div role="status" className="success-banner">
              <CheckCircle2 size={16} />
              {notice}
            </div>
          )}
          {run && (
            <section className="panel run-result">
              <SectionHeading
                title={
                  run.operation === "explain" ? "AI feedback" : "Test evidence"
                }
                aside={
                  <span className="badge">
                    Revision {run.revision} / {run.status}
                  </span>
                }
              />
              {(dirty || current?.revision !== run.revision) && (
                <p className="tiny">
                  Source changed. Run checks again to evaluate your latest work.
                </p>
              )}
              {running ? (
                <div className="run-pending">
                  <span className="pulse-orbit" />
                  <p>
                    {streamText
                      ? `Receiving feedback: ${streamText.length.toLocaleString()} characters`
                      : run.status === "queued"
                        ? "Waiting for the worker…"
                        : "Working through your code…"}
                  </p>
                  {run.operation !== "submit" && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void api(
                          `/runs/${run.id}/cancel`,
                          z.object({ ok: z.boolean() }),
                          { method: "POST" },
                        ).catch((e) => store.setError(String(e)))
                      }
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ) : run.error ? (
                <p role="alert" className="error-text">
                  {run.error}
                </p>
              ) : score.success ? (
                <>
                  <div className="score-number">
                    {score.data.passed === undefined
                      ? "Public checks"
                      : `${score.data.passed} / ${score.data.total}`}
                    <span>
                      {score.data.passed === undefined
                        ? "Hidden results stay private until submission."
                        : "checks passed on this saved revision"}
                    </span>
                  </div>
                  <div className="check-list">
                    {score.data.visible.map((item, index) => (
                      <div key={index}>
                        {item.passed ? (
                          <CheckCircle2 size={17} />
                        ) : (
                          <XCircle size={17} />
                        )}{" "}
                        Public case {index + 1}
                        <span>
                          {item.passed
                            ? "Passed"
                            : item.error || "Needs another look"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {score.data.visible.map((item, index) => (
                    <details
                      className="case-evidence"
                      key={index}
                      open={!item.passed}
                    >
                      <summary>Case {index + 1}: input and output</summary>
                      <dl>
                        <dt>Input arguments</dt>
                        <dd>
                          <pre>
                            {item.input ?? "Unavailable for this older run"}
                          </pre>
                        </dd>
                        <dt>Expected</dt>
                        <dd>
                          <pre>{JSON.stringify(item.expected, null, 2)}</pre>
                        </dd>
                        <dt>Actual</dt>
                        <dd>
                          <pre>
                            {item.error || JSON.stringify(item.actual, null, 2)}
                          </pre>
                        </dd>
                        {item.stdout && (
                          <>
                            <dt>Printed output</dt>
                            <dd>
                              <pre>{item.stdout}</pre>
                            </dd>
                          </>
                        )}
                      </dl>
                    </details>
                  ))}
                </>
              ) : analysis.success ? (
                <>
                  <h3>{analysis.data.summary}</h3>
                  <p className="prose">{analysis.data.explanation}</p>
                  {analysis.data.findings.map((f, i) => (
                    <div className="finding" key={i}>
                      {f.line && <b>Line {f.line}</b>} {f.message}
                    </div>
                  ))}
                </>
              ) : (
                <p className="muted">No result is available.</p>
              )}
            </section>
          )}
          {run?.status === "completed" && run.operation !== "explain" &&
            (!assessment || run.operation === "submit") && (
              <ReflectionPanel key={run.id} run={run} dirty={dirty}
                currentRevision={current?.revision} draftId={draftId} />
            )}
        </div>
        <aside className="practice-aside">
          <section className="panel hint-panel">
            <span className="metric-icon violet">
              <Lightbulb size={20} />
            </span>
            <h2>A nudge, when you need it.</h2>
            <Link href={(store.preview ? "/demo" : "/workspace") + "/resources"}>Read learning notes</Link>
            <p>
              Clues to help you reason through the problem, one step at a time.
            </p>
            <div className="hint-dots">
              {[0, 1, 2].map((n) => (
                <span
                  key={n}
                  className={(current?.hints.length ?? 0) > n ? "revealed" : ""}
                />
              ))}
            </div>
            <AnimatePresence>
              {current?.hints.map((hint, index) => (
                <motion.div
                  className="hint"
                  key={index}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                >
                  <small>CLUE {index + 1}</small>
                  <p>{hint}</p>
                </motion.div>
              ))}
            </AnimatePresence>
            <Button
              variant="secondary"
              disabled={
                !!busy ||
                (current?.hints.length ?? 0) >= 3 ||
                (assessment && (!current?.assistance || remaining === 0)) ||
                current?.status === "submitted"
              }
              busy={busy === "hint"}
              onClick={() => void action("hint")}
            >
              Reveal a clue <ChevronRight size={15} />
            </Button>
          </section>
          {!assessment && (
            <section className="panel ai-panel">
              <Sparkles size={21} />
              <h3>A second perspective</h3>
              <p>Ask your connected model to review your reasoning.</p>
              <Button
                variant="ghost"
                disabled={!!busy || running}
                busy={busy === "explain"}
                onClick={() => void action("explain")}
              >
                Explore with AI <ArrowUpRight size={15} />
              </Button>
            </section>
          )}
          {assessment && (
            <section className="panel">
              <h3>Ready to wrap up?</h3>
              <p className="muted">
                Submit your latest saved revision for all seven checks.
              </p>
              <Button
                disabled={
                  !!busy ||
                  current?.status === "submitted" ||
                  (assessment && remaining === 0)
                }
                busy={busy === "submit"}
                onClick={() => void action("submit")}
              >
                Submit assessment <CheckCircle2 size={16} />
              </Button>
            </section>
          )}
        </aside>
      </div>
      <Modal
        open={gate}
        close={() => setGate(false)}
        title="Make this workspace yours"
      >
        <p className="muted">
          Sign in to save your reasoning, run checks with a connected executor,
          and build your learning history.
        </p>
        <Link href="/login" className="button primary">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </Modal>
    </>
  );
}
