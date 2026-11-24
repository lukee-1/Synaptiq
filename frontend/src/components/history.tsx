"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowDownToLine, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { analysisSchema, reportSchema, scoreSchema } from "@/lib/contracts";
import type { RunReport } from "@/lib/contracts";
import { useWorkspace } from "./workspace-provider";
import { RatingEvidence } from "./reflection-panel";
import { Button, Empty, Reveal } from "./ui";
import catalog from "@/data/catalog.json";

export function History() {
  const { runs, preview, setError } = useWorkspace();
  const [reports, setReports] = useState<RunReport[]>([]);
  const [loading, setLoading] = useState(!preview);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    void api("/reports", z.array(reportSchema), { signal: controller.signal })
      .then(setReports)
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [preview, setError]);
  function exportReport() {
    const text = [
      "# Synaptiq learning report",
      "",
      ...reports.map((run) => {
        const challenge = catalog.find((c) => c.id === run.challenge_id);
        return `## ${challenge?.family ?? "Learning run"}\nStatus: ${run.status}\nRevision: ${run.revision}\nHints used: ${run.hints_used}\n\n### Initial source\n\n\x60\x60\x60python\n${challenge?.code ?? ""}\n\x60\x60\x60\n\n### Evaluated source\n\n\x60\x60\x60python\n${run.source}\n\x60\x60\x60\n\nDiagnosis: ${run.diagnosis}\n\n### Evidence\n\n\x60\x60\x60json\n${JSON.stringify(run.result, null, 2)}\n\x60\x60\x60\n\nReflection: ${run.reflection?.explanation ?? "Not yet recorded"}\nEvidence rating: ${run.reflection?.evaluation_status === "completed" ? run.reflection.confidence + "/5" : "Pending"}\nReasoning feedback: ${run.reflection?.feedback ?? "Pending"}\n`;
      }),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "Synaptiq-learning-report.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Reveal>
        <div className="page-heading">
          <div>
            <div className="eyebrow">THE EVIDENCE OF YOUR EFFORT</div>
            <h1>Look how your thinking grows.</h1>
            <p>
              Your 30 most recent runs, with their exact source and reflections.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={!reports.length || loading}
            onClick={exportReport}
          >
            <ArrowDownToLine size={16} /> Export report
          </Button>
        </div>
      </Reveal>
      <section className="panel history-panel">
        {!runs.length ? (
          <Empty
            title="Your story starts with a question."
            action={
              <Link
                className="button primary"
                href={(preview ? "/demo" : "/workspace") + "/challenges"}
              >
                Explore a challenge
              </Link>
            }
          >
            Completed runs will appear here. Each result belongs to the exact
            source revision that was evaluated.
          </Empty>
        ) : (
          runs.map((run) => {
            const report = reports.find((r) => r.id === run.id);
            const challenge = catalog.find(
              (c) => c.id === report?.challenge_id,
            );
            const score = scoreSchema.safeParse(run.result);
            const analysis = analysisSchema.safeParse(run.result);
            return (
              <details className="history-entry" key={run.id}>
                <summary>
                  <span className={"history-icon " + run.status}>
                    {run.operation === "explain" ? (
                      <Sparkles size={18} />
                    ) : run.status === "completed" ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock3 size={18} />
                    )}
                  </span>
                  <div>
                    <h3>{challenge?.family ?? "Learning session"}</h3>
                    <p>
                      {new Date(run.created_at).toLocaleString()} · Revision{" "}
                      {run.revision}
                    </p>
                  </div>
                  <span className="badge">
                    {score.success && score.data.passed !== undefined
                      ? `${score.data.passed}/${score.data.total} checks`
                      : run.status}
                  </span>
                </summary>
                <div className="history-detail">
                  {run.error ? (
                    <p className="error-text">{run.error}</p>
                  ) : analysis.success ? (
                    <p className="prose">{analysis.data.explanation}</p>
                  ) : score.success ? (
                    <p>
                      {score.data.passed ?? "Public"} checks completed.{" "}
                      {score.data.rating !== undefined
                        ? `Rating: ${score.data.rating}/5.`
                        : ""}
                    </p>
                  ) : (
                    <p className="muted">
                      The worker has not produced a result yet.
                    </p>
                  )}
                  {report && (
                    <>
                      <h3 className="field-label">
                        Evaluated source · revision {report.revision}
                      </h3>
                      <pre>{report.source}</pre>
                      <h3 className="field-label">Your diagnosis</h3>
                      <p>{report.diagnosis || "No diagnosis recorded."}</p>
                      <h3 className="field-label">Your reflection</h3>
                      <p>
                        {report.reflection?.explanation ?? "No reflection yet."}
                      </p>
                      {report.reflection && (
                        <RatingEvidence reflection={report.reflection} />
                      )}
                    </>
                  )}
                </div>
              </details>
            );
          })
        )}
      </section>
    </>
  );
}
