"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Bot, Send, Undo2, Check, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectFile } from "@/lib/contracts";
import { Button, SectionHeading } from "./ui";
import { chatTurnSchema, agentReplySchema } from "@/lib/contracts";
import type { ChatTurn } from "@/lib/contracts";

export function ProjectAssistant({ projectId, file, dirty, onChanged }: {
  projectId: string; file: ProjectFile; dirty: boolean; onChanged: () => Promise<void>;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [message, setMessage] = useState("");
  const [autoApply, setAutoApply] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasOlder, setHasOlder] = useState(false);
  const seen = useRef(new Map<string, string>());
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let initial = true;
    async function refresh() {
      try {
        const rows = await api(`/projects/${projectId}/chat`, z.array(chatTurnSchema), { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (initial) { setHasOlder(rows.length === 30); initial = false; }
        setTurns((previous) => [...rows, ...previous.filter((turn) => !rows.some((row) => row.id === turn.id))].sort((a,b) => a.created_at.localeCompare(b.created_at)));
        let revised = false;
        for (const row of rows) {
          const revision = `${row.applied_revision ?? ""}:${row.reverted_revision ?? ""}`;
          const previous = seen.current.get(row.id);
          if (previous !== undefined && previous !== revision) revised = true;
          seen.current.set(row.id, revision);
        }
        if (revised) await changed.current();
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not refresh chat");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 2000);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId]);
  const pending = turns.some((turn) => turn.status === "queued" || turn.status === "running");
  async function send() {
    if (!message.trim() || busy || pending || dirty) return;
    setBusy(true); setError("");
    try {
      const turn = await api(`/projects/${projectId}/chat`, chatTurnSchema, { method: "POST", body: {
        file_id: file.id, revision: file.revision, message: message.trim(), auto_apply: autoApply, idempotency_key: crypto.randomUUID(),
      } });
      seen.current.set(turn.id, ":");
      setTurns((previous) => [...previous, turn]); setMessage("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send message"); }
    finally { setBusy(false); }
  }
  async function change(turnId: string, action: "apply" | "undo" | "cancel") {
    setBusy(true); setError("");
    try {
      const updated = await api(`/chat/${turnId}/${action}`, chatTurnSchema, { method: "POST" });
      setTurns((previous) => previous.map((turn) => turn.id === turnId ? updated : turn));
      await changed.current();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update repair"); }
    finally { setBusy(false); }
  }
  async function older() {
    setBusy(true);
    try {
      const next = turns.length;
      const rows = await api(`/projects/${projectId}/chat?offset=${next}`, z.array(chatTurnSchema));
      setTurns((previous) => [...rows.filter((row) => !previous.some((turn) => turn.id === row.id)), ...previous].sort((a,b) => a.created_at.localeCompare(b.created_at)));
      setHasOlder(rows.length === 30);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load older messages"); }
    finally { setBusy(false); }
  }
  return <section id="project-assistant" className="panel project-assistant" aria-label="Project coding assistant">
    <SectionHeading title="Your coding assistant" aside={<span className="badge"><Bot size={15} /> Local AI</span>} />
    <p className="muted">Describe the behavior you expect, the error you see, or a change you want. Working on <strong>{file.path}</strong>, saved revision {file.revision}.</p>
    <p className="tiny">Select another file in the explorer to change context. Repairs are saved as new revisions. Imported code is not executed.</p>
    {hasOlder && <Button variant="ghost" disabled={busy} onClick={() => void older()}>Load older messages <ChevronDown size={14} /></Button>}
    <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
      {!turns.length && <div className="chat-empty"><Bot size={24} /><h3>What should this code do?</h3><p>For example: “This function skips the last item. Explain why and fix the boundary.”</p></div>}
      {turns.map((turn) => {
        const reply = agentReplySchema.safeParse(turn.response);
        return <article className="chat-turn" key={turn.id}>
          <div className="chat-user"><b>You</b><span className="tiny"> · {turn.file_id === file.id ? file.path : "Another project file"} · revision {turn.revision}</span><p>{turn.prompt}</p></div>
          <div className="chat-assistant"><b>Synaptiq assistant</b>
            {turn.status === "queued" || turn.status === "running" ? <><p role="status">{turn.status === "queued" ? "Waiting for the local model…" : "Reading your saved source and preparing a reply…"}</p><Button variant="ghost" disabled={busy} onClick={() => void change(turn.id,"cancel")}>Cancel request</Button></> : reply.success ? <>
              <p className="prose">{reply.data.message}</p>
              {reply.data.context_truncated && <p className="tiny">This file is large; the assistant used a focused excerpt. Describe the relevant function if more context is needed.</p>}
              {reply.data.edits.map((edit,index) => <details className="repair-diff" key={index} open><summary>Change {index+1}: {edit.reason}</summary><div className="diff-columns"><div><b>Before</b><pre>{edit.search}</pre></div><div><b>After</b><pre>{edit.replacement || "(Removed)"}</pre></div></div></details>)}
              <p className="tiny">{reply.data.validation}</p>
              {turn.reverted_revision ? <p className="success-banner">Repair undone in revision {turn.reverted_revision}.</p> : turn.applied_revision ? <><p className="success-banner"><Check size={15} /> Applied as revision {turn.applied_revision}.</p><Button variant="ghost" disabled={busy || dirty} onClick={() => void change(turn.id,"undo")}><Undo2 size={14} /> Undo this repair</Button></> : reply.data.validated && !turn.error ? <Button disabled={busy || dirty} onClick={() => void change(turn.id,"apply")}>Apply proposed repair</Button> : null}
            </> : <p>{turn.status === "cancelled" ? "Request cancelled. Your source was preserved." : "A validated reply was not available. Try a more specific request."}</p>}
            {turn.error && <p role="alert" className="error-text">{turn.error}</p>}
          </div>
        </article>;
      })}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="field-label" htmlFor="assistant-message">Describe your scenario</label>
      <textarea id="assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={3} placeholder="What should happen? What actually happens?" />
      <div className="chat-compose-actions"><label className="toggle-label"><input type="checkbox" checked={autoApply} onChange={(event) => setAutoApply(event.target.checked)} /> Apply validated fixes automatically</label><Button type="submit" busy={busy} disabled={busy || pending || dirty || !message.trim()}><Send size={15} /> Send</Button></div>
      {dirty && <p className="info-callout">Save your editor changes first so the assistant works on the right revision.</p>}
      {error && <p role="alert" className="error-text">{error}</p>}
    </form>
  </section>;
}
