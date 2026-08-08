"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FilePdf,
  LockKey,
  MagnifyingGlass,
  ShieldCheck,
  Lightning,
  X,
} from "@phosphor-icons/react";
import { CATEGORIES, TOOLS, type CategoryId, type ToolId } from "@/lib/tools";
import { TOOL_ICONS } from "./ToolIcons";
import { SiteFooter } from "./SiteFooter";

const FEATURED: ToolId[] = [
  "merge-pdf",
  "compress-pdf",
  "pdf-to-word",
  "word-to-pdf",
  "rotate-pdf",
  "redact-pdf",
];

export function HomePage() {
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLElement>(null);

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.blurb.toLowerCase().includes(q) ||
        t.id.replace(/-/g, " ").includes(q)
      );
    });
  }, [category, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bg-[var(--canvas)]">
      {/* Soft glow sits on the same canvas — no second color band */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 100% 0%, rgba(15,138,95,0.11), transparent 55%),
            radial-gradient(ellipse 40% 35% at 0% 20%, rgba(15,138,95,0.05), transparent 50%),
            var(--canvas)
          `,
        }}
      />

      <section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-4 pb-14 sm:px-8 sm:pt-8 sm:pb-16 lg:grid-cols-2 lg:gap-12 lg:pb-20">
          <div className="animate-rise max-w-xl">
            <p className="text-sm font-semibold tracking-tight text-moss">
              LocalFold
            </p>
            <h1 className="mt-3 text-[2.6rem] font-semibold tracking-[-0.04em] text-ink sm:text-[3.5rem] sm:leading-[1.05]">
              PDF tools that{" "}
              <span className="text-moss">stay on your device.</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-[1.65] text-ink-soft sm:text-base">
              Merge, convert, compress, redact — in the browser. Nothing
              uploads. Close the tab and it’s gone.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link
                href="/#tools"
                className="pressable inline-flex items-center gap-2 rounded-full bg-moss px-5 py-3 text-sm font-semibold text-paper transition-colors hover:bg-moss-deep"
              >
                Browse tools
                <ArrowRight weight="bold" className="h-4 w-4" />
              </Link>
              <Link
                href="/tool/merge-pdf"
                className="pressable inline-flex items-center gap-2 rounded-full border border-line bg-[var(--canvas)] px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-moss/35 hover:bg-moss-soft"
              >
                <FilePdf weight="duotone" className="h-4 w-4 text-moss" />
                Start with Merge
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-ink-soft">
              <li className="inline-flex items-center gap-1.5">
                <LockKey weight="bold" className="h-3.5 w-3.5 text-moss" />
                No uploads
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck weight="bold" className="h-3.5 w-3.5 text-moss" />
                No account
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Lightning weight="bold" className="h-3.5 w-3.5 text-moss" />
                Instant results
              </li>
            </ul>
          </div>

          <div
            className="animate-rise relative mx-auto w-full max-w-md lg:max-w-none"
            style={{ animationDelay: "0.08s" }}
            aria-hidden
          >
            <div className="rounded-[1.75rem] border border-line/80 bg-paper p-4 shadow-[var(--shadow)] sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss-soft text-moss">
                    <FilePdf weight="duotone" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-ink">
                      report.pdf
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      2.4 MB · this device
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-moss-soft px-2.5 py-1 text-[11px] font-semibold text-moss-deep">
                  <LockKey weight="bold" className="h-3 w-3" />
                  Local
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {(
                  [
                    ["merge-pdf", "Merge"],
                    ["compress-pdf", "Compress"],
                    ["redact-pdf", "Redact"],
                  ] as const
                ).map(([id, label]) => {
                  const Icon = TOOL_ICONS[id];
                  const tool = TOOLS.find((t) => t.id === id);
                  return (
                    <Link
                      key={id}
                      href={`/tool/${id}`}
                      className="pressable flex flex-col items-center gap-2 rounded-xl border border-line/80 bg-[var(--canvas)] px-2 py-3 transition-colors hover:border-moss/35 hover:bg-moss-soft"
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{
                          background: `${tool?.accent ?? "#0f8a5f"}18`,
                          color: tool?.accent ?? "#0f8a5f",
                        }}
                      >
                        <Icon weight="duotone" className="h-4 w-4" />
                      </span>
                      <span className="text-[11px] font-semibold text-ink">
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 space-y-2.5 rounded-xl bg-[var(--canvas)] p-3.5">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-ink-soft">Processing</span>
                  <span className="text-moss-deep">100% local</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-mist">
                  <div className="h-full w-[78%] rounded-full bg-moss" />
                </div>
                <ul className="space-y-2 pt-1 text-[12px] text-ink-soft">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-moss" />
                    File stays in this tab
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-moss" />
                    No server, no account
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-moss" />
                    Cleared when you close
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-6 sm:px-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Start here
          </h2>
          <p className="text-sm text-ink-soft">Most used</p>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-6">
          {FEATURED.map((id) => {
            const tool = TOOLS.find((t) => t.id === id);
            if (!tool) return null;
            const Icon = TOOL_ICONS[id];
            return (
              <li key={id}>
                <Link
                  href={`/tool/${id}`}
                  className="pressable group flex h-full flex-col items-start rounded-2xl border border-line/70 bg-[color-mix(in_srgb,var(--paper)_70%,var(--canvas))] p-3.5 transition-[border-color,background-color,box-shadow] duration-200 hover:border-moss/30 hover:bg-paper hover:shadow-[var(--shadow)] sm:p-4"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{
                      background: `${tool.accent}16`,
                      color: tool.accent,
                    }}
                  >
                    <Icon weight="duotone" className="h-5 w-5" />
                  </span>
                  <span className="mt-3 text-[13px] font-semibold tracking-tight text-ink group-hover:text-moss-deep">
                    {tool.title.replace(" PDF", "")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        id="tools"
        ref={toolsRef}
        className="scroll-mt-[calc(var(--nav-clearance)+0.5rem)] relative mx-auto max-w-6xl px-5 pt-10 pb-16 sm:px-8 sm:pt-12 sm:pb-20"
      >
        <div className="flex flex-col gap-5 border-t border-line/60 pt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
                All tools
              </h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                {tools.length} of {TOOLS.length}
              </p>
            </div>

            <label className="relative block w-full sm:max-w-[17rem]">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft"
                weight="bold"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-line bg-[color-mix(in_srgb,var(--paper)_70%,var(--canvas))] py-2.5 pr-14 pl-9 text-sm text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ink-soft/70 focus:border-moss/35 focus:bg-paper focus:shadow-[0_0_0_3px_rgba(15,138,95,0.1)]"
              />
              <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-line bg-[var(--canvas)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-soft sm:inline">
                ⌘K
              </kbd>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="pressable absolute top-1/2 right-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-soft hover:bg-mist sm:right-11"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" weight="bold" />
                </button>
              )}
            </label>
          </div>

          <div
            className="category-scroll -mx-5 flex gap-1 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            role="tablist"
            aria-label="Tool categories"
          >
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(c.id)}
                  className={`pressable shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-ink text-paper"
                      : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7">
          {tools.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
              <p className="text-base font-semibold text-ink">No tools match</p>
              <p className="mt-1 text-sm text-ink-soft">
                Try another word, or clear filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
                className="pressable mt-4 rounded-full bg-moss px-4 py-2 text-sm font-semibold text-paper hover:bg-moss-deep"
              >
                Reset
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => {
                const Icon = TOOL_ICONS[tool.id];
                return (
                  <li key={tool.id}>
                    <Link
                      href={`/tool/${tool.id}`}
                      className="tool-card pressable group flex items-center gap-3.5 rounded-2xl px-3.5 py-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--paper)_80%,var(--canvas))]"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: `${tool.accent}16`,
                          color: tool.accent,
                        }}
                      >
                        <Icon weight="duotone" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink group-hover:text-moss-deep">
                            {tool.title}
                          </h3>
                          {tool.badge && (
                            <span className="shrink-0 rounded-full bg-moss-soft px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-moss-deep uppercase">
                              {tool.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-ink-soft">
                          {tool.blurb}
                        </p>
                      </div>
                      <ArrowRight
                        weight="bold"
                        className="h-4 w-4 shrink-0 text-ink-soft/35 transition group-hover:translate-x-0.5 group-hover:text-moss"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
