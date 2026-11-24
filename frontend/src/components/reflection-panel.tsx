"use client";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { reflectionSchema } from "@/lib/contracts";
import type { Run } from "@/lib/contracts";
import { Button, SectionHeading } from "./ui";
import { useWorkspace } from "./workspace-provider";

type Reflection = z.infer<typeof reflectionSchema>;
export function RatingEvidence({ reflection }: { reflection: Reflection }) {
  return <div className="rating-evidence" aria-live="polite">
    <strong>{reflection.evaluation_status === "completed" ? `Evidence rating: ${reflection.confidence.toFixed(2)} / 5` : reflection.evaluation_status === "failed" ? "Answer saved; evaluation unavailable" : "Answer saved; evaluating your reasoning…"}</strong>
    <p className="tiny">60% verified code score (including hint use), 20% diagnosis, 20% final explanation. Written reasoning is assessed by AI; this rating is not a claim of certainty.</p>
    <div className="rating-parts"><span>Code <b>{reflection.code_score} / 5</b></span><span>Diagnosis <b>{reflection.diagnosis_score ?? "Pending"}{reflection.diagnosis_score !== null && " / 5"}</b></span><span>Explanation <b>{reflection.explanation_score ?? "Pending"}{reflection.explanation_score !== null && " / 5"}</b></span></div>
    {reflection.feedback && <p className="prose">{reflection.feedback}</p>}
  </div>;
}

export function ReflectionPanel({ run, dirty, currentRevision, draftId }: { run: Run; dirty: boolean; currentRevision: number | undefined; draftId: string }) {
  const { drafts, setDraft } = useWorkspace();
  const draftKey = `${draftId}:reflection:${run.id}`;
  const [why, setWhy] = useState(drafts[draftKey] ?? "");
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const saved = await api(`/reflections/${run.id}`, reflectionSchema, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setReflection(saved);
        setWhy((previous) => previous || saved.explanation);
        if (saved.evaluation_status === "queued" || saved.evaluation_status === "running") timer = setTimeout(() => void poll(), 2000);
      } catch (reason) {
        if (!controller.signal.aborted && !(reason instanceof ApiError && reason.status === 404)) {
          setError(reason instanceof Error ? reason.message : "Could not load your reflection");
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run.id, retry]);
  const changed = dirty || currentRevision !== run.revision;
  async function submit() {
    if (busy || changed || why.trim().length < 12) return;
    setBusy(true); setError("");
    try {
      const saved = await api("/reflections", reflectionSchema, { method: "POST", body: { run_id: run.id, explanation: why.trim() } });
      setReflection(saved); setRetry((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your answer could not be saved"); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <SectionHeading title="03 / Connect the dots" />
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="field-label" htmlFor="why">Why does your repair work?</label>
      <textarea id="why" rows={4} value={why} onChange={(event) => { setWhy(event.target.value); setDraft(draftKey, event.target.value); }} maxLength={3000} aria-describedby="reflection-help" placeholder="Explain the cause, the invariant your change preserves, and a boundary case." />
      <p id="reflection-help" className="tiny">{why.trim().length} / 3000 characters. Use at least 12 characters. Your diagnosis is taken from the evaluated run.</p>
      {changed && <p className="info-callout">Your code or diagnosis has changed. Run the current revision before submitting this explanation.</p>}
      <Button type="submit" disabled={busy || changed || why.trim().length < 12} busy={busy}>Submit explanation <CheckCircle2 size={15} /></Button>
      {error && <p role="alert" className="error-text">{error}</p>}
    </form>
    {reflection && <RatingEvidence reflection={reflection} />}
  </section>;
}
