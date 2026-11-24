"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  projectSchema,
  runSchema,
  sessionSchema,
  workspaceSchema,
} from "@/lib/contracts";
import type { Project, Run, Session, Workspace } from "@/lib/contracts";

type Store = {
  preview: boolean;
  name: string;
  workspace: Workspace | null;
  sessions: Session[];
  projects: Project[];
  runs: Run[];
  loading: boolean;
  error: string;
  setError: (message: string) => void;
  refresh: () => Promise<void>;
  updateSession: (session: Session) => void;
  drafts: Record<string, string>;
  setDraft: (id: string, source: string) => void;
};
const Context = createContext<Store | null>(null);
export function WorkspaceProvider({
  children,
  preview = false,
  name = "Developer",
}: {
  children: ReactNode;
  preview?: boolean;
  name?: string;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    if (preview) return;
    try {
      const [w, s, p, r] = await Promise.all([
        api("/workspaces/bootstrap", workspaceSchema, { method: "POST" }),
        api("/sessions", z.array(sessionSchema)),
        api("/projects", z.array(projectSchema)),
        api("/runs", z.array(runSchema)),
      ]);
      setWorkspace(w);
      setSessions(s);
      setProjects(p);
      setRuns(r);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load workspace",
      );
    } finally {
      setLoading(false);
    }
  }, [preview]);
  useEffect(() => {
    let active = true;
    // Start the subscription in a microtask; prevent setup after unmount.
    void Promise.resolve().then(() => {
      if (active) return refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <Context.Provider
      value={{
        preview,
        name,
        workspace,
        sessions,
        projects,
        runs,
        loading,
        error,
        setError,
        refresh,
        drafts,
        setDraft: (id, source) =>
          setDrafts((previous) => ({ ...previous, [id]: source })),
        updateSession: (session) =>
          setSessions((previous) => [
            session,
            ...previous.filter((s) => s.id !== session.id),
          ]),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceProvider is required");
  return value;
}
