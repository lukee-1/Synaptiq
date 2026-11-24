import { Shell } from "@/components/shell";
import { WorkspaceProvider } from "@/components/workspace-provider";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider preview>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
