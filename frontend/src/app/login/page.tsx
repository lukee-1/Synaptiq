"use client";
import { concepts, tracks } from "@/lib/catalog";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Github, Sparkles } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { browserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const { data } = browserClient().auth.onAuthStateChange(
      (event, session) => {
        setAlreadySignedIn(Boolean(session));
        if (event === "SIGNED_IN" && session && pendingConfirmation) {
          router.replace("/workspace");
          router.refresh();
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [router, pendingConfirmation]);
  async function confirmEmail(useCode: boolean) {
    setBusy(true);
    setError("");
    try {
      const client = browserClient();
      const result = useCode
        ? await client.auth.verifyOtp({
            email,
            token: otp.trim(),
            type: "signup",
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session)
        throw new Error(
          "Confirmation is still pending. Open the newest email or enter its verification code.",
        );
      router.replace("/workspace");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not confirm email",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const { error } = await browserClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMessage(
        "A fresh confirmation email was requested. Use the newest message.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not resend confirmation",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const client = browserClient();
      if (mode === "signup") {
        const result = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setPendingConfirmation(true);
          setMessage(
            "Check your email to confirm your account. Keep this page open, then press Continue after confirming. If the email contains a code, you can enter it here.",
          );
          return;
        }
      } else if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset`,
        });
        if (error) throw error;
        setMessage("If this email has an account, a reset link is on its way.");
        return;
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      router.push("/workspace");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  async function github() {
    setBusy(true);
    try {
      const { error } = await browserClient().auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "GitHub sign-in failed",
      );
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link href="/demo" className="brand">
          <span className="brand-icon">
            <Sparkles size={22} />
          </span>
          synaptiq.
        </Link>
        <div className="auth-art">
          <span className="auth-art-symbol">{"{ }"}</span>
          <div className="auth-orbit" />
          <div className="auth-orbit second" />
          <span className="auth-code-label">curiosity → clarity</span>
        </div>
        <div className="auth-copy">
          <div className="eyebrow">A BETTER WAY TO THINK IN CODE</div>
          <h1>
            Every great fix
            <br />
            starts with <em>why.</em>
          </h1>
          <p>
            Build your debugging intuition in a workspace designed for
            thoughtful experiments.
          </p>
          <div className="auth-stats">
            <span>
              <strong>{concepts.length}</strong>concepts
            </span>
            <span>
              <strong>{tracks.length}</strong>learning tracks
            </span>
            <span>
              <strong>You</strong>in the driver’s seat
            </span>
          </div>
        </div>
      </section>
      <section className="auth-form-side">
        <Link href="/demo" className="back-link">
          <ArrowLeft size={14} /> Explore the workspace
        </Link>
        <div className="auth-form-wrap">
          <div className="eyebrow">YOUR NEXT BREAKTHROUGH STARTS HERE</div>
          <h2>
            {mode === "reset"
              ? "Find your way back."
              : mode === "signup"
                ? "Make room for curiosity."
                : "Good to see you again."}
          </h2>
          <p className="muted">
            {mode === "reset"
              ? "We’ll send a link to reset your password."
              : "Sign in to keep your work and your progress together."}
          </p>
          {alreadySignedIn && !pendingConfirmation && <p className="info-callout">You are already signed in. <Link href="/workspace">Return to your workspace</Link>, or use Account → Sign out there before switching accounts.</p>}
          {mode !== "reset" && (
            <div className="auth-tabs">
              {(["signin", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setMode(tab);
                    setError("");
                    setMessage("");
                  }}
                >
                  {mode === tab && <motion.span layoutId="auth-tab" />}
                  <b>{tab === "signin" ? "Sign in" : "Create account"}</b>
                </button>
              ))}
            </div>
          )}
          {params.get("error") === "callback" && (
            <p className="info-callout" role="alert">
              This link could not open a session. It may have expired or been
              opened in another browser. If your email is confirmed, sign in
              below with your password. Otherwise request a fresh confirmation.
            </p>
          )}
          {pendingConfirmation && (
            <section className="panel">
              <p role="status">{message}</p>
              <label className="field-label" htmlFor="verification-code">
                Verification code from your email (if provided)
              </label>
              <input
                id="verification-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
              />
              <Button
                disabled={busy || !otp.trim()}
                onClick={() => void confirmEmail(true)}
              >
                Verify code
              </Button>
              <Button disabled={busy} onClick={() => void confirmEmail(false)}>
                Continue after confirming email
              </Button>
              <button
                disabled={busy}
                className="text-link"
                onClick={() => void resend()}
              >
                Resend confirmation email
              </button>
            </section>
          )}
          <form onSubmit={(event) => void submit(event)}>
            {mode === "signup" && (
              <label>
                Display name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            {mode !== "reset" && (
              <label>
                Password
                <input
                  type="password"
                  minLength={mode === "signup" ? 10 : 1}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  placeholder="At least 10 characters"
                />
              </label>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="success-banner" role="status">
                {message}
              </p>
            )}
            <Button busy={busy} type="submit">
              {mode === "signup"
                ? "Create your workspace"
                : mode === "reset"
                  ? "Send reset link"
                  : "Continue to your workspace"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {mode !== "reset" && (
            <>
              <div className="auth-divider">or continue with</div>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void github()}
              >
                <Github size={18} /> GitHub
              </Button>
            </>
          )}
          <button
            className="text-link reset-link"
            onClick={() => {
              setMode(mode === "reset" ? "signin" : "reset");
              setMessage("");
              setError("");
            }}
          >
            {mode === "reset" ? "Back to sign in" : "Forgot your password?"}
          </button>
          <p className="tiny auth-foot">
            Your code, your reasoning, your progress.
          </p>
        </div>
      </section>
    </main>
  );
}
