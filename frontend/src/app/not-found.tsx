import Link from "next/link";

export default function NotFound() {
  return (
    <main className="reset-page">
      <section className="panel empty">
        <div className="eyebrow">404 / A DIFFERENT PATH</div>
        <h1>This page is out of bounds.</h1>
        <p>Return to your learning space to keep exploring.</p>
        <Link href="/demo" className="button primary">
          Open Synaptiq
        </Link>
      </section>
    </main>
  );
}
