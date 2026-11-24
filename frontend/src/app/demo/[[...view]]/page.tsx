import { WorkspaceView } from "@/components/workspace-view";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view } = await params;
  return <WorkspaceView view={view?.[0] ?? ""} />;
}
