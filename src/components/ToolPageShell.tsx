"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, type Icon } from "@phosphor-icons/react";
import { TOOLS, type ToolId } from "@/lib/tools";
import { TOOL_ICONS } from "./ToolIcons";

const DEFAULT_RELATED: ToolId[] = [
  "merge-pdf",
  "compress-pdf",
  "pdf-to-word",
  "rotate-pdf",
];

export function ToolPageShell({
  children,
  width = "narrow",
  relatedIds,
}: {
  children: ReactNode;
  width?: "narrow" | "wide" | "full";
  relatedIds?: ToolId[];
}) {
  const maxW =
    width === "full"
      ? "max-w-[1400px]"
      : width === "wide"
        ? "max-w-6xl"
        : "max-w-3xl";

  const ids = (relatedIds?.length ? relatedIds : DEFAULT_RELATED).slice(0, 4);
  const related = ids
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is (typeof TOOLS)[number] => Boolean(t));

  const isNarrow = width === "narrow";

  return (
    <div className="bg-[var(--canvas)]">
      <div
        className={`mx-auto flex w-full flex-col px-5 sm:px-8 ${maxW} ${
          isNarrow
            ? "min-h-[calc(100dvh-var(--nav-clearance))] pt-6 pb-10 sm:pt-8 sm:pb-12"
            : "pt-6 pb-10 sm:pt-8 sm:pb-12"
        }`}
      >
        <Link
          href="/#tools"
          className="pressable inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" weight="bold" />
          All tools
        </Link>

        {/* Narrow tools: center the card so pages don’t look top-heavy + empty */}
        <div
          className={
            isNarrow
              ? "flex flex-1 flex-col justify-center py-8 sm:py-10"
              : "mt-5 sm:mt-6"
          }
        >
          {children}
          <p className="mt-5 text-center text-xs leading-relaxed text-ink-soft">
            Processed in this browser tab only. Nothing is uploaded.{" "}
            <Link
              href="/privacy"
              className="font-medium text-moss transition-colors hover:text-moss-deep"
            >
              Privacy
            </Link>
          </p>
        </div>

        {related.length > 0 && (
          <div
            className={`border-t border-line/70 pt-6 ${
              isNarrow ? "mt-auto" : "mt-10"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                Related tools
              </h2>
              <Link
                href="/#tools"
                className="text-xs font-semibold text-moss hover:text-moss-deep"
              >
                View all
              </Link>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {related.map((tool) => {
                const Icon = TOOL_ICONS[tool.id];
                return (
                  <li key={tool.id}>
                    <Link
                      href={`/tool/${tool.id}`}
                      className="pressable group flex items-center gap-3 rounded-2xl border border-line/70 bg-[color-mix(in_srgb,var(--paper)_70%,var(--canvas))] px-3.5 py-3 transition-colors hover:border-moss/30 hover:bg-paper"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: `${tool.accent}16`,
                          color: tool.accent,
                        }}
                      >
                        <Icon weight="duotone" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink group-hover:text-moss-deep">
                          {tool.title}
                        </p>
                        <p className="truncate text-xs text-ink-soft">
                          {tool.blurb}
                        </p>
                      </div>
                      <ArrowRight
                        weight="bold"
                        className="h-3.5 w-3.5 shrink-0 text-ink-soft/40 group-hover:text-moss"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`animate-rise rounded-2xl border border-line bg-paper p-5 shadow-[var(--shadow)] sm:rounded-[20px] sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

export function ToolHeader({
  title,
  blurb,
  accent,
  Icon,
  aside,
  size = "default",
}: {
  title: string;
  blurb: string;
  accent: string;
  Icon: Icon;
  aside?: ReactNode;
  size?: "default" | "compact";
}) {
  const iconBox =
    size === "compact"
      ? "h-10 w-10 sm:h-11 sm:w-11 rounded-xl"
      : "h-12 w-12 sm:h-14 sm:w-14 rounded-2xl";
  const iconSize =
    size === "compact" ? "h-5 w-5 sm:h-6 sm:w-6" : "h-7 w-7 sm:h-8 sm:w-8";
  const titleSize =
    size === "compact" ? "text-xl sm:text-2xl" : "text-xl sm:text-3xl";

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
        <span
          className={`flex shrink-0 items-center justify-center ${iconBox}`}
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon weight="duotone" className={iconSize} />
        </span>
        <div className="min-w-0 pt-0.5">
          <h1
            className={`font-semibold tracking-[-0.03em] text-ink ${titleSize}`}
          >
            {title}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{blurb}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}

export function ToolDropzone({
  label,
  hint = "or drop it here",
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  dragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (files: FileList | null) => void;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={() => onDragLeave()}
      onDrop={(e) => {
        e.preventDefault();
        onDragLeave();
        onDrop(e.dataTransfer.files);
      }}
      onClick={onClick}
      className={`pressable mt-5 cursor-pointer rounded-2xl border border-dashed px-5 py-12 text-center transition-[background-color,border-color,transform] duration-150 sm:mt-6 sm:px-6 sm:py-14 ${
        dragOver
          ? "border-moss bg-moss-soft"
          : "border-line-strong/80 bg-mist/40 hover:border-moss/40 hover:bg-mist/70"
      }`}
    >
      <p className="text-base font-semibold text-ink sm:text-lg">{label}</p>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      {children}
    </div>
  );
}
