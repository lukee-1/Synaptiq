"use client";
import Link from "next/link";
import { useState } from "react";
import { Clock3, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { catalog, concepts, firstChallenge, scenarioName } from "@/lib/catalog";
import { sessionSchema } from "@/lib/contracts";
import type { Session } from "@/lib/contracts";
import { useWorkspace } from "./workspace-provider";
import { Button, Empty, SectionHeading } from "./ui";
import { Practice } from "./challenges";

export function Assessments() {
  const store = useWorkspace();
  const [family, setFamily] = useState(firstChallenge.family);
  const variants = catalog.filter((row) => row.family === family);
  const [scenarioId, setScenarioId] = useState(firstChallenge.id);
  const [assistance, setAssistance] = useState(false);
  const [active, setActive] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = catalog.find((row) => row.id === scenarioId) ?? variants[0] ?? firstChallenge;
  const history = store.sessions.filter((row) => row.mode === "assessment");
  const currentChallenge =
    active && catalog.find((row) => row.id === active.challenge_id);
  async function start(): Promise<Session | null> {
    if (!store.workspace) return null;
    setBusy(true);
    try {
      const session = await api("/sessions", sessionSchema, {
        method: "POST",
        body: {
          workspace_id: store.workspace.id,
          challenge_id: selected.id,
          mode: "assessment",
          assistance,
        },
      });
      store.updateSession(session);
      setActive(session);
      return session;
    } catch (error) {
      store.setError(
        error instanceof Error ? error.message : "Could not start assessment",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (active && currentChallenge)
    return (
      <Practice
        key={active.id}
        challenge={currentChallenge}
        session={active}
        assessment
        start={start}
        back={() => {
          setActive(null);
          void store.refresh();
        }}
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEASURE YOUR PROGRESS</div>
          <h1>Your assessment studio.</h1>
          <p>
            Set up a timed attempt, submit your repair, and review the evidence.
          </p>
        </div>
        <span className="badge">
          <ShieldCheck size={16} /> Timed assessment
        </span>
      </div>
      <div className="assessment-setup">
        <section className="panel assessment-form">
          <SectionHeading title="Prepare your attempt" />
          <label className="field-label" htmlFor="assessment-concept">
            1 / Choose a concept
          </label>
          <select
            id="assessment-concept"
            value={family}
            onChange={(event) => {
              setFamily(event.target.value);
              setScenarioId(
                catalog.find((row) => row.family === event.target.value)!.id,
              );
            }}
          >
            {concepts.map((concept) => (
              <option key={concept.family}>{concept.family}</option>
            ))}
          </select>
          <label className="field-label" htmlFor="assessment-scenario">
            2 / Choose a scenario
          </label>
          <select
            id="assessment-scenario"
            value={selected.id}
            onChange={(event) => setScenarioId(event.target.value)}
          >
            {variants.map((row) => (
              <option key={row.id} value={row.id}>
                {scenarioName(row.name)}
              </option>
            ))}
          </select>
          <p className="muted">{selected.description}</p>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={assistance}
              onChange={(event) => setAssistance(event.target.checked)}
            />{" "}
            Allow clues for this attempt
          </label>
          <p className="tiny">
            Each clue deducts 0.2 from the code score. AI guidance is reserved
            for practice.
          </p>
          {store.preview ? (
            <Link className="button primary" href="/login">
              Sign in to start an assessment <ArrowRight size={16} />
            </Link>
          ) : (
            <Button
              busy={busy}
              disabled={busy || !store.workspace}
              onClick={() => void start()}
            >
              Start five-minute assessment <ArrowRight size={16} />
            </Button>
          )}
        </section>
        <aside className="panel assessment-rules">
          <Clock3 size={30} />
          <h2>Five minutes. One repair.</h2>
          <p>Your timer starts only after you press Start.</p>
          <ul>
            <li>Two public cases provide input and output while you work.</li>
            <li>Five hidden cases count toward your final score.</li>
            <li>Changes save automatically. Watch the saved indicator.</li>
            <li>The server submits the last saved revision at the deadline.</li>
          </ul>
          <p className="tiny">
            Resume an active attempt below without resetting its timer.
          </p>
        </aside>
      </div>
      <section className="panel">
        <SectionHeading
          title="Your assessment attempts"
          aside={<span className="badge">{history.length} recent</span>}
        />
        {!history.length ? (
          <Empty title="Your first benchmark starts here">
            Completed attempts and active timers will appear here.
          </Empty>
        ) : (
          history.map((session) => {
            const challenge = catalog.find(
              (row) => row.id === session.challenge_id,
            );
            const run = store.runs.find(
              (row) =>
                row.session_id === session.id && row.operation === "submit",
            );
            return (
              <div className="assessment-attempt" key={session.id}>
                <CheckCircle2 size={18} />
                <div>
                  <h3>{challenge?.family ?? session.challenge_id}</h3>
                  <p className="tiny">
                    {challenge && scenarioName(challenge.name)} ·{" "}
                    {new Date(session.created_at).toLocaleString()} ·{" "}
                    {run?.status ?? session.status}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setActive(session)}>
                  {session.status === "active"
                    ? "Resume attempt"
                    : "Review attempt"}
                </Button>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
