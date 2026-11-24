"use client";
import { Button } from "@/components/ui";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty" role="alert">
      <h1>Let’s reconnect your workspace.</h1>
      <p>
        The workspace could not be loaded. Your saved work is still in your
        account.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
