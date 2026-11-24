"use client";
import { Suspense } from "react";
import { LearningNotes } from "./learning-notes";
import { Overview } from "./overview";
import { Challenges } from "./challenges";
import { Assessments } from "./assessments";
import { Projects } from "./projects";
import { History } from "./history";
import { SettingsView } from "./settings";
import { Skeleton } from "./ui";
import { useWorkspace } from "./workspace-provider";
export function WorkspaceView({ view }: { view: string }) {
  const { loading } = useWorkspace();
  if (loading) return <Skeleton />;
  if (view === "challenges")
    return (
      <Suspense fallback={<Skeleton />}>
        <Challenges />
      </Suspense>
    );
  if (view === "assessments")
    return (
      <Suspense fallback={<Skeleton />}>
        <Assessments />
      </Suspense>
    );
  if (view === "projects") return <Projects />;
  if (view === "resources") return <LearningNotes />;
  if (view === "history") return <History />;
  if (view === "settings") return <SettingsView />;
  return <Overview />;
}
