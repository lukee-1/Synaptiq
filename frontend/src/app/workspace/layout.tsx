import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { WorkspaceProvider } from "@/components/workspace-provider";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await serverClient();
  if (!client) redirect("/login");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/login");
  const displayName: unknown = data.user.user_metadata.display_name;
  const name =
    typeof displayName === "string"
      ? displayName
      : (data.user.email?.split("@")[0] ?? "Developer");
  return (
    <WorkspaceProvider name={name}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
