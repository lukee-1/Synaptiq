"use client";
import { concepts, tracks } from "@/lib/catalog";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDot,
  Code2,
  GitBranch,
  Layers3,
  Sparkles,
  Target,
} from "lucide-react";
import catalog from "@/data/catalog.json";
import { scoreSchema } from "@/lib/contracts";
import { useWorkspace } from "./workspace-provider";
import { Reveal, SectionHeading, Spotlight } from "./ui";

export function Overview() {
  const { preview, name, sessions, runs } = useWorkspace();
  const base = preview ? "/demo" : "/workspace";
  const completed = runs.filter(
    (run) => run.status === "completed" && run.operation !== "explain",
  );
  const solved = new Set(
    completed
      .filter((run) => {
        const score = scoreSchema.safeParse(run.result);
        return score.success && score.data.passed === score.data.total;
      })
      .map((run) => run.session_id),
  ).size;
  const metrics = [
    {
      label: "Challenges solved",
      value: String(solved).padStart(2, "0"),
      foot: "Every fix is a step forward",
      icon: Target,
      color: "mint",
    },
    {
      label: "Practice sessions",
      value: String(sessions.filter((session) => session.mode === "practice").length).padStart(2, "0"),
      foot: "Make room for curiosity",
      icon: Code2,
      color: "violet",
    },
    {
      label: "Learning tracks",
      value: String(tracks.length),
      foot: "From arrays to graph theory",
      icon: GitBranch,
      color: "blue",
    },
    {
      label: "Checks completed",
      value: String(
        completed.reduce((total, run) => {
          const score = scoreSchema.safeParse(run.result);
          return total + (score.success ? score.data.total : 0);
        }, 0),
      ).padStart(2, "0"),
      foot: "Evidence behind your intuition",
      icon: Check,
      color: "amber",
    },
  ];
  const recommendations = [catalog[0], catalog[20], catalog[50]].filter(
    (item) => item !== undefined,
  );
  return (
    <>
      <Reveal>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR LEARNING SPACE</div>
            <h1>
              {preview
                ? "A clearer path to better code."
                : `Welcome back, ${name}.`}
            </h1>
            <p>
              Small experiments. Deeper understanding. One thoughtful fix at a
              time.
            </p>
          </div>
          <Link href={base + "/projects"} className="button secondary">
            Import a project <ArrowUpRight size={16} />
          </Link>
        </div>
      </Reveal>
      <Reveal delay={0.04}>
        <section className="hero">
          <div className="hero-grid" />
          <div className="hero-copy">
            <span className="hero-label">
              <Sparkles size={13} /> BUILT FOR YOUR NEXT BREAKTHROUGH
            </span>
            <h2>
              Don’t just fix the bug.
              <br />
              <em>Understand the why.</em>
            </h2>
            <p>
              A focused space to test your thinking, untangle your code,
              <br className="desktop-break" /> and build intuition that lasts.
            </p>
            <Link href={base + "/challenges"} className="button primary">
              Start a challenge <ArrowRight size={16} />
            </Link>
            <span className="hero-footnote">{concepts.length} concepts. Your pace.</span>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="floating-code">
              <div className="code-top">
                <i />
                <i />
                <i />
                <span>one_step_closer.py</span>
                <Code2 size={13} />
              </div>
              <div className="code-lines">
                <div>
                  <span>01</span> <b>def</b> think_deeper(problem):
                </div>
                <div>
                  <span>02</span> &nbsp; hypothesis = <em>understand</em>
                  (problem)
                </div>
                <div>
                  <span>03</span> &nbsp; <b>while</b> curious:
                </div>
                <div>
                  <span>04</span> &nbsp; &nbsp; test(hypothesis)
                </div>
                <div>
                  <span>05</span> &nbsp; &nbsp; <em>learn</em>()
                </div>
              </div>
              <div className="code-bottom">
                <span>
                  <i /> A little clearer than before.
                </span>
                <span>Python</span>
              </div>
            </div>
            <div className="floating-check">
              <Check size={16} /> Understanding unlocked
            </div>
          </div>
        </section>
      </Reveal>
      <div className="metric-grid">
        {metrics.map((metric, i) => (
          <Reveal key={metric.label} delay={0.08 + i * 0.04}>
            <Spotlight className="metric-card">
              <div className="metric-top">
                <span>{metric.label}</span>
                <span className={"metric-icon " + metric.color}>
                  <metric.icon size={17} />
                </span>
              </div>
              <strong>{metric.value}</strong>
              <small>{metric.foot}</small>
            </Spotlight>
          </Reveal>
        ))}
      </div>
      <div className="overview-grid">
        <Reveal delay={0.16}>
          <section className="panel">
            <SectionHeading
              title="Pick up a new perspective"
              aside={
                <Link href={base + "/challenges"} className="text-link">
                  Browse all <ArrowUpRight size={14} />
                </Link>
              }
            />
            <p className="section-description">
              A few starting points to get your thinking moving.
            </p>
            <div className="recommendations">
              {recommendations.map((item, i) => (
                <Link
                  href={`${base}/challenges?challenge=${item.id}`}
                  className="recommendation"
                  key={item.id}
                >
                  <span className={"challenge-glyph glyph-" + i}>
                    {i === 0 ? (
                      <Layers3 size={21} />
                    ) : i === 1 ? (
                      <GitBranch size={21} />
                    ) : (
                      <Code2 size={21} />
                    )}
                  </span>
                  <div>
                    <h3>{item.family}</h3>
                    <p>
                      {item.topic}
                      <span>·</span>Explain → repair → reflect
                    </p>
                  </div>
                  <span className="difficulty easy">{item.difficulty}</span>
                  <ArrowUpRight className="row-arrow" size={18} />
                </Link>
              ))}
            </div>
          </section>
        </Reveal>
        <Reveal delay={0.2}>
          <section className="panel path-panel">
            <div className="eyebrow">THE SYNAPTIQ WAY</div>
            <h2>Make your thinking visible.</h2>
            <p className="section-description">
              Good debugging begins before the first edit.
            </p>
            <div className="learning-steps">
              {[
                ["01", "Explain your hunch", "Put your reasoning into words."],
                [
                  "02",
                  "Explore the evidence",
                  "Test, trace, and ask for a clue.",
                ],
                ["03", "Connect the dots", "Reflect on what actually changed."],
              ].map(([number, title, detail]) => (
                <div key={number}>
                  <span>{number}</span>
                  <section>
                    <h3>{title}</h3>
                    <p>{detail}</p>
                  </section>
                </div>
              ))}
            </div>
            <Link href={base + "/assessments"} className="text-link">
              Ready for a five-minute challenge? <ArrowUpRight size={15} />
            </Link>
          </section>
        </Reveal>
      </div>
      <Reveal delay={0.24}>
        <section className="panel activity-strip">
          <div className="activity-icon">
            <CircleDot size={23} />
          </div>
          <div>
            <h3>Your progress has a story.</h3>
            <p>
              {sessions.length
                ? `${sessions.length} recent sessions. Revisit your reasoning and see what changed.`
                : "Your first session is the beginning. Your reflections will appear here as you practice."}
            </p>
          </div>
          <Link href={base + "/history"} className="button ghost">
            Learning history <ArrowRight size={15} />
          </Link>
        </section>
      </Reveal>
    </>
  );
}
