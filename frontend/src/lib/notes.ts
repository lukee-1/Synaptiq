import data from "@/data/notes.json";
export type LearningNote = (typeof data)[number];
export const learningNotes = data;
export function noteMarkdown(note: LearningNote): string {
  return `# ${note.topic}\n\n## ${note.title}\n\n${note.overview}\n\n## Rule to remember\n\n${note.invariant}\n\n## Common mistakes\n\n${note.pitfalls}\n\n## Complexity\n\n${note.complexity}\n\n## Practice method\n\n${note.steps.map((step,index) => `${index+1}. ${step}`).join("\n")}\n`;
}
export function downloadMarkdown(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
