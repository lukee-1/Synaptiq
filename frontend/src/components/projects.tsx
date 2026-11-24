"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  Braces,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  Plus,
  Save,
  Upload,
} from "lucide-react";
import { uploadSource } from "@/lib/uploads";
import { excludedPath } from "@/lib/source-files";
import { api } from "@/lib/api";
import { fileSchema, findingSchema, projectSchema } from "@/lib/contracts";
import type { Finding, ProjectFile } from "@/lib/contracts";
import { useWorkspace } from "./workspace-provider";
import { Button, Empty, Modal, Reveal, SectionHeading } from "./ui";
import { ProjectAssistant } from "./project-assistant";
import { CodeEditor } from "./code-editor";

const sample: ProjectFile = {
  id: "preview-file",
  project_id: "preview-project",
  path: "src/prefix_sum.py",
  source:
    "def range_sum(nums, left, right):\n    prefix = [0]\n    for number in nums:\n        prefix.append(prefix[-1] + number)\n\n    # Which boundary belongs here?\n    return prefix[right] - prefix[left]\n",
  revision: 1,
  updated_at: "2026-11-17T00:00:00Z",
};
export function Projects() {
  const store = useWorkspace();
  const { setError, preview } = store;
  const [projectId, setProjectId] = useState(
    store.preview ? "preview-project" : "",
  );
  const [files, setFiles] = useState<ProjectFile[]>(
    store.preview ? [sample] : [],
  );
  const [selected, setSelected] = useState(store.preview ? sample.id : "");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [inspectedRevision, setInspectedRevision] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [importReport, setImportReport] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [gate, setGate] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const active = files.find((f) => f.id === selected);
  const source = active ? (store.drafts[active.id] ?? active.source) : "";
  const dirty = active && source !== active.source;
  useEffect(() => {
    if (preview || !projectId) return;
    const controller = new AbortController();
    void api(`/projects/${projectId}/files`, z.array(fileSchema), {
      signal: controller.signal,
    })
      .then((rows) => {
        setFiles(rows);
        setSelected(rows[0]?.id ?? "");
        setFindings([]);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, [projectId, preview, setError]);
  async function importFiles(list: FileList | null) {
    if (!list?.length) return;
    if (store.preview) {
      setGate(true);
      return;
    }
    if (!store.workspace) return;
    setBusy("import");
    try {
      const picked = Array.from(list);
      setImportReport("");
      const name =
        picked[0]?.webkitRelativePath.split("/")[0] ||
        picked[0]?.name ||
        "Untitled project";
      const project = await api("/projects", projectSchema, {
        method: "POST",
        body: {
          workspace_id: store.workspace.id,
          name: name.slice(0, 100),
          files: [],
        },
      });
      const imported: ProjectFile[] = [];
      const skipped: string[] = [];
      const failed: string[] = [];
      for (const [index, file] of picked.entries()) {
        const path = file.webkitRelativePath || file.name;
        setImportProgress(`Reading ${index + 1} of ${picked.length}: ${path}`);
        if (excludedPath(path)) {
          skipped.push(path);
          continue;
        }
        let source: string;
        try {
          source = new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          );
          if (source.includes("\0")) {
            skipped.push(path);
            continue;
          }
        } catch {
          skipped.push(path);
          continue;
        }
        try {
          setImportProgress(
            `Uploading ${index + 1} of ${picked.length}: ${path}`,
          );
          imported.push(await uploadSource(project.id, path, source));
        } catch (error) {
          failed.push(
            `${path}: ${error instanceof Error ? error.message : "Upload failed"}`,
          );
        }
      }
      setFiles(imported);
      setSelected(imported[0]?.id ?? "");
      setImportReport(
        `${imported.length} files imported. ${skipped.length} binary, generated, or credential files skipped.` +
          (failed.length
            ? ` ${failed.length} failed: ${failed.slice(0, 5).join("; ")}`
            : ""),
      );
      await store.refresh();
      setProjectId(project.id);
      setImportOpen(false);
    } catch (error) {
      store.setError(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy("");
      setImportProgress("");
      if (fileInput.current) fileInput.current.value = "";
      if (folderInput.current) folderInput.current.value = "";
    }
  }
  async function save(inspect = false) {
    if (!active) return;
    if (store.preview) {
      setGate(true);
      return;
    }
    setBusy(inspect ? "inspect" : "save");
    try {
      const updated = dirty
        ? await uploadSource(
            active.project_id,
            active.path,
            source,
            active.revision,
          )
        : active;
      setFiles((previous) =>
        previous.map((f) => (f.id === updated.id ? updated : f)),
      );
      if (inspect) {
        setFindings(
          await api(`/files/${updated.id}/inspect`, z.array(findingSchema), {
            method: "POST",
          }),
        );
        setInspectedRevision(updated.revision);
      }
    } catch (error) {
      store.setError(
        error instanceof Error ? error.message : "Could not save file",
      );
    } finally {
      setBusy("");
    }
  }
  function download() {
    if (!active) return;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = active.path.split("/").pop() ?? "source.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Reveal>
        <div className="page-heading">
          <div>
            <div className="eyebrow">BRING YOUR OWN CURIOSITY</div>
            <h1>Your code. A fresh perspective.</h1>
            <p>
              Explore your source, keep every revision, and follow the evidence.
            </p>
          </div>
          <Button onClick={() => setImportOpen(true)}>
            <Plus size={16} /> Import project
          </Button>
        </div>
      </Reveal>
      {importReport && (
        <p className="info-callout" role="status">
          {importReport}
        </p>
      )}
      <div className="project-tabs">
        {store.preview ? (
          <span className="badge">
            <FolderOpen size={15} /> Example project
          </span>
        ) : (
          store.projects.map((p) => (
            <button
              className={projectId === p.id ? "selected" : ""}
              key={p.id}
              onClick={() => setProjectId(p.id)}
            >
              <Folder size={15} />
              {p.name}
            </button>
          ))
        )}
      </div>
      {files.length ? (
        <div className="project-layout">
          <aside className="panel file-tree">
            <SectionHeading
              title="Explorer"
              aside={<small>{files.length} files</small>}
            />
            <div className="tree-root">
              <FolderOpen size={16} />{" "}
              {store.preview
                ? "learning-lab"
                : (store.projects.find((p) => p.id === projectId)?.name ??
                  "Project")}
            </div>
            {files.map((file) => (
              <button
                key={file.id}
                className={file.id === selected ? "selected" : ""}
                onClick={() => {
                  setSelected(file.id);
                  setFindings([]);
                  setInspectedRevision(null);
                }}
              >
                <FileCode2 size={15} />
                <span>{file.path}</span>
                {store.drafts[file.id] !== undefined &&
                store.drafts[file.id] !== file.source ? (
                  <i className="unsaved-dot" />
                ) : (
                  <Check size={12} />
                )}
              </button>
            ))}
            <p className="tree-note">
              Drafts stay with each file as you switch. Save to keep a new
              revision.
            </p>
          </aside>
          <div>
            {active && (
              <section className="editor-panel">
                <div className="editor-tabs">
                  <span>
                    <FileCode2 size={15} /> {active.path}
                  </span>
                  <span>Revision {active.revision}</span>
                </div>
                <CodeEditor
                  code={source}
                  onChange={(value) => store.setDraft(active.id, value)}
                />
                <div className="editor-actions">
                  <span className={dirty ? "unsaved" : "muted"}>
                    {dirty
                      ? "● Unsaved changes"
                      : store.preview
                        ? "Example source"
                        : "All changes saved"}
                  </span>
                  <div>
                    {!preview && <a className="button ghost" href="#project-assistant">Ask assistant</a>}
                    <Button variant="ghost" onClick={download}>
                      <Download size={14} /> Download
                    </Button>
                    <Button
                      variant="secondary"
                      busy={busy === "save"}
                      disabled={!!busy}
                      onClick={() => void save()}
                    >
                      <Save size={14} /> Save
                    </Button>
                    <Button
                      busy={busy === "inspect"}
                      disabled={!!busy}
                      onClick={() => void save(true)}
                    >
                      Inspect code <ChevronRight size={15} />
                    </Button>
                  </div>
                </div>
              </section>
            )}
            <section className="panel diagnostics">
              <SectionHeading
                title="Inspection findings"
                aside={
                  inspectedRevision && (
                    <span className="badge">Revision {inspectedRevision}</span>
                  )
                }
              />
              {findings.length ? (
                findings.map((finding, i) => (
                  <div className={"finding " + finding.severity} key={i}>
                    {finding.line && <b>Line {finding.line}</b>}{" "}
                    {finding.message}
                  </div>
                ))
              ) : (
                <div className="diagnostic-empty">
                  <Braces size={24} />
                  <p>
                    Inspect your saved source to see supported syntax checks.
                  </p>
                </div>
              )}
              <p className="tiny">
                Python and JSON receive parser checks. Imported projects are
                never executed.
              </p>
            </section>
          </div>
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={
              store.projects.length
                ? "Choose a project"
                : "Good questions start with real code."
            }
            action={
              <Button onClick={() => setImportOpen(true)}>
                <Upload size={16} /> Import your first project
              </Button>
            }
          >
            Bring a file or a folder into your workspace. Your original source
            and saved revisions stay together.
          </Empty>
        </section>
      )}
      {active && !preview && <ProjectAssistant key={projectId} projectId={projectId} file={active} dirty={!!dirty} onChanged={async () => {
        const rows = await api(`/projects/${projectId}/files`, z.array(fileSchema));
        setFiles(rows);
        const latest = rows.find((row) => row.id === selected);
        if (latest && !dirty) store.setDraft(latest.id, latest.source);
        setFindings([]); setInspectedRevision(null);
      }} />}
      <Modal
        open={importOpen}
        close={() => setImportOpen(false)}
        title="Bring your project into the lab"
      >
        <p className="muted">
          Import text files or a whole source folder. Chunked transfers remove
          app-level file-count and file-size caps.
        </p>
        {importProgress && (
          <p role="status" className="info-callout">
            {importProgress}
          </p>
        )}
        <div className="import-options">
          <button disabled={!!busy} onClick={() => fileInput.current?.click()}>
            <Upload size={26} />
            <strong>Choose files</strong>
            <small>One file or a few related pieces</small>
          </button>
          <button
            disabled={!!busy}
            onClick={() => folderInput.current?.click()}
          >
            <FolderOpen size={26} />
            <strong>Choose a folder</strong>
            <small>Keep relative paths intact</small>
          </button>
        </div>
        {busy && <p role="status">Importing your source…</p>}
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => void importFiles(e.target.files)}
        />
        <input
          ref={(element) => {
            folderInput.current = element;
            element?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(e) => void importFiles(e.target.files)}
        />
        <p className="tiny">
          Exclude credentials, environment files, build output, and
          dependencies.
        </p>
      </Modal>
      <Modal
        open={gate}
        close={() => setGate(false)}
        title="Save your own projects"
      >
        <p className="muted">
          This is an editable preview. Sign in to import projects, save
          revisions, and run static checks.
        </p>
        <Link href="/login" className="button primary">
          Sign in
        </Link>
      </Modal>
    </>
  );
}
