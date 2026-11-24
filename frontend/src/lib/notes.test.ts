import { describe, expect, it } from "vitest";
import { learningNotes, noteMarkdown } from "./notes";
import { tracks } from "./catalog";

describe("learning notes", () => {
  it("covers every distinct challenge track once", () => {
    expect(learningNotes.map(note => note.topic).sort()).toEqual([...tracks].sort());
  });
  it("exports the complete viewed content as readable Markdown", () => {
    for (const note of learningNotes) {
      const markdown = noteMarkdown(note);
      for (const text of [note.title,note.overview,note.invariant,note.pitfalls,note.complexity,...note.steps]) expect(markdown).toContain(text);
      expect(markdown.startsWith(`# ${note.topic}\n`)).toBe(true);
    }
  });
  it("does not expose private reference programs or hidden tests", () => {
    expect(JSON.stringify(learningNotes)).not.toMatch(/reference_code|hidden_inputs|INT-\d{2}-\d-\d/);
  });
});
