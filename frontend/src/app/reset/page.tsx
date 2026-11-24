"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
export default function Reset() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get("code");
    const client = browserClient();
    void (
      code ? client.auth.exchangeCodeForSession(code) : client.auth.getSession()
    ).then(({ data, error }) => {
      if (error || !data.session)
        setMessage(
          "This reset link has expired. Request another from sign-in.",
        );
      else setReady(true);
    });
  }, []);
  return (
    <main className="reset-page">
      <div className="panel">
        <h1>A fresh start.</h1>
        <p className="muted">Choose a new password for your workspace.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const { error } = await browserClient().auth.updateUser({
              password,
            });
            setMessage(
              error?.message ??
                "Password updated. You can return to your workspace.",
            );
            setBusy(false);
          }}
        >
          <label className="field-label">
            New password
            <input
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={!ready} busy={busy}>
            Update password
          </Button>
        </form>
        <p role="status">{message}</p>
        <Link href="/workspace" className="text-link">
          Return to workspace →
        </Link>
      </div>
    </main>
  );
}
