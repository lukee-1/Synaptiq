"use client";
import { concepts } from "@/lib/catalog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  Blocks,
  BookOpen,
  ChevronDown,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { browserClient } from "@/lib/supabase/client";
import { useWorkspace } from "./workspace-provider";
import { Button, Modal } from "./ui";

const nav = [
  { title: "Overview", path: "", icon: LayoutDashboard },
  { title: "Challenge arena", path: "/challenges", icon: Command },
  { title: "My projects", path: "/projects", icon: Blocks },
  { title: "Assessments", path: "/assessments", icon: Timer },
  { title: "Learning notes", path: "/resources", icon: BookOpen },
  { title: "Learning history", path: "/history", icon: Activity },
];
export function Shell({ children }: { children: ReactNode }) {
  const { preview, name, error, setError } = useWorkspace();
  const base = preview ? "/demo" : "/workspace";
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const [help, setHelp] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement;
    const controls = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      );
    controls()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 701px)");
    const resize = () => {
      if (desktop.matches) setMenu(false);
    };
    document.addEventListener("keydown", keyboard);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", keyboard);
      desktop.removeEventListener("change", resize);
      if (
        previous instanceof HTMLElement &&
        !document.querySelector("dialog[open]")
      )
        previous.focus();
    };
  }, [menu]);
  function showHelp() {
    setMenu(false);
    setHelp(true);
  }
  const title =
    nav.find((n) => pathname === base + n.path)?.title ?? "Settings";
  async function signOut() {
    const { error } = await browserClient().auth.signOut();
    if (error) { setError(error.message); return; }
    router.replace("/login");
    router.refresh();
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        {menu && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <aside
          ref={sidebarRef}
          className={clsx("sidebar", menu && "open")}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a"))
              setMenu(false);
          }}
        >
          <Link href={base} className="brand">
            <span className="brand-icon">
              <Sparkles size={22} />
            </span>
            synaptiq<span className="brand-dot">.</span>
          </Link>
          <button className="workspace-switch" onClick={showHelp}>
            <span className="workspace-avatar">P</span>
            <span>
              Personal workspace<small>Learning lab</small>
            </span>
            <ChevronDown size={14} />
          </button>
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Workspace">
            {nav.map((item) => (
              <Link
                key={item.path}
                href={base + item.path}
                onClick={() => setMenu(false)}
                className={clsx(
                  "nav-link",
                  pathname === base + item.path && "active",
                )}
              >
                {pathname === base + item.path && (
                  <motion.span
                    layoutId="navigation"
                    className="nav-active"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )}
                <item.icon size={18} />
                <span>{item.title}</span>
                {item.path === "/challenges" && <small>{concepts.length}</small>}
              </Link>
            ))}
          </nav>
          <div className="nav-label resources-label">RESOURCES</div>
          <button className="nav-link" onClick={showHelp}>
            <BookOpen size={18} />
            <span>How it works</span>
            <ArrowUpRight size={13} />
          </button>
          <Link href={base + "/settings"} className="nav-link">
            <Settings2 size={18} />
            <span>Settings</span>
          </Link>
          <div className="sidebar-bottom">
            <div className="learning-note">
              <span className="tiny-stars">✦</span>
              <strong>A little deeper, every day.</strong>
              <p>Build the habit of understanding why your code works.</p>
              <Link href={base + "/challenges"}>
                Find your next challenge <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="user">
              <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{preview ? "Preview workspace" : name}</strong>
                <small>
                  {preview ? "Explore before signing in" : "Personal account"}
                </small>
              </div>
              {!preview && (
                <button
                  onClick={() => void signOut()}
                  aria-label="Sign out"
                  className="icon-button"
                >
                  <LogOut size={17} />
                </button>
              )}
            </div>
          </div>
        </aside>
        <div className="app-main" inert={menu}>
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMenu(true)}
              >
                <Menu size={20} />
              </button>
              <span>Workspace</span>
              <span>/</span>
              <b>{title}</b>
            </div>
            <div className="top-actions">
              <Link className="search-shortcut" href={base + "/challenges"}>
                <Search size={15} />
                <span>Find a challenge</span>
                <kbd>⌕</kbd>
              </Link>
              <span className="status">
                <i />
                {preview ? "Interactive preview" : "Personal workspace"}
              </span>
              {preview ? <div className="account-links"><Link href="/login" className="button secondary small">Log in</Link><Link href="/login?mode=signup" className="button primary small">Sign up</Link></div> : <Button variant="secondary" onClick={() => setAccount(true)}>Account</Button>}
            </div>
          </header>
          <main className="main-content">
            {preview && (
              <div className="preview-notice">
                You’re exploring a preview. Sign in to save work and connect
                live services.
              </div>
            )}
            {error && (
              <div role="alert" className="error-banner">
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {children}
            <footer className="footer">
              <span>
                <span className="footer-dot" /> Think deeper. Debug smarter.
              </span>
              <span>Synaptiq · Learning lab</span>
            </footer>
          </main>
        </div>
        <Modal open={account} close={() => setAccount(false)} title="Your account">
          <p>You are signed in as <strong>{name}</strong>.</p>
          <p className="muted">Your projects and learning history are saved to this account. Sign out to log in with another account or create a new one.</p>
          <Button onClick={() => void signOut()}><LogOut size={16} /> Sign out</Button>
        </Modal>
        <Modal
          open={help}
          close={() => setHelp(false)}
          title="Think before you fix"
        >
          <p className="muted">
            Choose a challenge, explain your hypothesis, then test your repair.
            Hints help you reason through the problem. Your test results and
            reflections become a record of your learning.
          </p>
          <div className="info-callout">
            Projects receive static checks. AI guidance requires a connected
            model; code execution requires the isolated runner.
          </div>
          <Button onClick={() => setHelp(false)}>
            Got it <ArrowUpRight size={16} />
          </Button>
        </Modal>
      </div>
    </MotionConfig>
  );
}
