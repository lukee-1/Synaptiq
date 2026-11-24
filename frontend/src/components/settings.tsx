"use client";
import { useState } from "react";
import { CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { z } from "zod";
import { publicEnvironment } from "@/lib/env";
import { Button, SectionHeading } from "./ui";

export function SettingsView() {
  const [health, setHealth] = useState<{
    database_configured: boolean;
    model_configured: boolean;
    executor_configured: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const env = publicEnvironment();
      const response = await fetch(
        `${env.success ? env.data.apiUrl : "http://127.0.0.1:8000"}/health`,
      );
      if (!response.ok) throw new Error("API unavailable");
      setHealth(
        z
          .object({
            database_configured: z.boolean(),
            model_configured: z.boolean(),
            executor_configured: z.boolean(),
          })
          .parse(await response.json()),
      );
      setError("");
    } catch {
      setError(
        "The API is not reachable. Start the backend or check its configured address.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE, CONNECTED</div>
          <h1>A clear view of your setup.</h1>
          <p>Connection details without exposing credentials.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <SectionHeading
          title="Service configuration"
          aside={
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => void check()}
            >
              <RefreshCw size={14} /> Check services
            </Button>
          }
        />
        <p className="muted">
          Configuration checks show whether the API has connection settings.
          They do not run a model or execute code. Hosted jobs use the configured
          laptop worker, which must remain running and connected to the internet.
        </p>
        {[
          ["Database & authentication", health?.database_configured],
          ["Local model server", health?.model_configured],
          ["Isolated code executor", health?.executor_configured],
        ].map(([label, ready]) => (
          <div className="service-row" key={String(label)}>
            {ready ? <CheckCircle2 size={19} /> : <Circle size={19} />}
            <strong>{label}</strong>
            <span className="badge">
              {health
                ? ready
                  ? "Configured"
                  : "Not configured"
                : "Not checked"}
            </span>
          </div>
        ))}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="panel settings-panel">
        <SectionHeading title="A workspace that respects your focus" />
        <p className="muted">
          Motion follows your system’s reduced-motion preference. Camera and
          microphone access are not required. Private source is visible only
          within your workspace.
        </p>
      </section>
    </>
  );
}
