"use client";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, Download, Search } from "lucide-react";
import { learningNotes, noteMarkdown, downloadMarkdown } from "@/lib/notes";
import { useWorkspace } from "./workspace-provider";
import { Button, Reveal } from "./ui";

export function LearningNotes() {
  const { preview } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(learningNotes[0]?.topic ?? "");
  const filtered = learningNotes.filter((note) => `${note.topic} ${note.title} ${note.overview}`.toLowerCase().includes(query.toLowerCase()));
  const current = filtered.find((note) => note.topic === selected) ?? filtered[0];
  return <>
    <Reveal><div className="page-heading"><div><div className="eyebrow">STUDY BEFORE YOU SOLVE</div><h1>Ideas worth keeping.</h1><p>View and download notes for all {learningNotes.length} learning tracks.</p></div><Button variant="secondary" onClick={() => downloadMarkdown(learningNotes.map(noteMarkdown).join("\n---\n\n"), "Synaptiq-all-notes.md")}><Download size={16} /> Download all notes</Button></div></Reveal>
    <div className="notes-layout"><section className="panel notes-index" aria-label="Learning topics"><label className="field-label" htmlFor="note-search"><Search size={14} /> Find a topic</label><input id="note-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learning notes" /><div className="notes-topics">{filtered.map((note) => <button key={note.topic} aria-pressed={current?.topic === note.topic} onClick={() => setSelected(note.topic)}><BookOpen size={15} /> {note.topic}</button>)}</div>{!filtered.length && <p>No matching notes. Try a broader search.</p>}</section>
      {current && <article className="panel note-content"><div className="eyebrow">{current.topic}</div><h2>{current.title}</h2><p>{current.overview}</p><h3>Rule to remember</h3><p className="info-callout">{current.invariant}</p><h3>Common mistakes</h3><p>{current.pitfalls}</p><h3>Complexity</h3><p>{current.complexity}</p><h3>Practice method</h3><ol>{current.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="note-actions"><Button onClick={() => downloadMarkdown(noteMarkdown(current), `Synaptiq-${current.topic.replace(/[^a-z0-9]+/gi,"-")}.md`)}><Download size={16} /> Download this note</Button><Link className="button secondary" href={(preview ? "/demo" : "/workspace") + "/challenges"}>Practice a challenge</Link></div></article>}
    </div>
  </>;
}
