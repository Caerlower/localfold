"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DownloadSimple,
  SpinnerGap,
  type Icon,
} from "@phosphor-icons/react";
import type { PdfPageThumb, StudioStatus } from "@/lib/pdfStudio";
import { formatBytes } from "@/lib/format";
import { TOOLS, type ToolId } from "@/lib/tools";
import {
  ToolCard,
  ToolDropzone,
  ToolHeader,
  ToolPageShell,
} from "@/components/ToolPageShell";

const STUDIO_RELATED: ToolId[] = [
  "merge-pdf",
  "split-pdf",
  "compress-pdf",
  "rotate-pdf",
];

type Props = {
  title: string;
  blurb: string;
  accent: string;
  Icon: Icon;
  file: File | null;
  pages: PdfPageThumb[];
  status: StudioStatus;
  message: string;
  actionLabel: string;
  sidebar: ReactNode;
  onAction: () => void;
  onClear: () => void;
  onFile: (file: File) => void;
  actionDisabled?: boolean;
  renderOverlay?: (page: PdfPageThumb, index: number) => ReactNode;
  pageImageStyle?:
    | CSSProperties
    | ((page: PdfPageThumb, index: number) => CSSProperties | undefined);
  renderPageFooter?: (page: PdfPageThumb, index: number) => ReactNode;
  isPageSelected?: (page: PdfPageThumb, index: number) => boolean;
  onPageClick?: (page: PdfPageThumb, index: number) => void;
};

export function PdfStudioShell({
  title,
  blurb,
  accent,
  Icon,
  file,
  pages,
  status,
  message,
  actionLabel,
  sidebar,
  onAction,
  onClear,
  onFile,
  actionDisabled,
  renderOverlay,
  pageImageStyle,
  renderPageFooter,
  isPageSelected,
  onPageClick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (f) onFile(f);
  };

  const relatedIds = STUDIO_RELATED.filter((id) => {
    const t = TOOLS.find((x) => x.id === id);
    return t && t.title !== title;
  }).slice(0, 4);

  if (!file) {
    return (
      <ToolPageShell relatedIds={relatedIds}>
        <ToolCard>
          <ToolHeader title={title} blurb={blurb} accent={accent} Icon={Icon} />
          <ToolDropzone
            label="Select PDF"
            dragOver={dragOver}
            onDragOver={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={pick}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />
          </ToolDropzone>
          {message && (
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                status === "error"
                  ? "bg-red-50 text-[var(--danger)]"
                  : "bg-mist text-ink-soft"
              }`}
            >
              {message}
            </p>
          )}
        </ToolCard>
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell width="wide">
      <ToolHeader
        title={title}
        blurb={blurb}
        accent={accent}
        Icon={Icon}
        size="compact"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="max-w-[240px] truncate rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink">
              {file.name}
            </span>
            <span className="text-ink-soft">{formatBytes(file.size)}</span>
            <button
              type="button"
              onClick={onClear}
              className="pressable rounded-full border border-line bg-paper px-3 py-1.5 text-ink-soft transition-colors hover:text-[var(--danger)]"
            >
              Clear
            </button>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-[1fr_280px]">
        <section className="rounded-2xl border border-line bg-[#e8ebe9] p-3 sm:rounded-[20px] sm:p-5">
          {status === "loading" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-ink-soft">
              <SpinnerGap className="h-8 w-8 animate-spin text-moss" />
              <p className="text-sm">{message || "Loading pages…"}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {pages.map((page, index) => {
                const selected = isPageSelected?.(page, index) ?? false;
                const imgStyle =
                  typeof pageImageStyle === "function"
                    ? pageImageStyle(page, index)
                    : pageImageStyle;
                return (
                  <li
                    key={page.id}
                    className={`relative flex flex-col rounded-2xl bg-paper p-3 shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-150 ${
                      selected
                        ? "ring-2 ring-moss ring-offset-2 ring-offset-[#e8ebe9]"
                        : ""
                    } ${onPageClick ? "pressable cursor-pointer" : ""}`}
                    onClick={
                      onPageClick
                        ? () => onPageClick(page, index)
                        : undefined
                    }
                  >
                    <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-mist">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.thumbUrl}
                        alt={`Page ${index + 1}`}
                        className="max-h-full max-w-full object-contain transition-transform duration-200"
                        style={imgStyle}
                      />
                      {renderOverlay?.(page, index)}
                    </div>
                    <p className="mt-2 text-center text-xs font-semibold text-ink-soft">
                      Page {index + 1}
                    </p>
                    {renderPageFooter?.(page, index)}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="h-fit rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow)] sm:rounded-[20px] sm:p-5 lg:sticky lg:top-[calc(var(--nav-clearance)+0.75rem)]">
          {sidebar}

          <button
            type="button"
            onClick={onAction}
            disabled={
              actionDisabled ||
              status === "working" ||
              status === "loading" ||
              !pages.length
            }
            className="pressable mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-moss px-5 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-moss-deep disabled:opacity-45 sm:mt-5"
          >
            {status === "working" ? (
              <>
                <SpinnerGap className="h-4 w-4 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <DownloadSimple className="h-4 w-4" weight="bold" />
                {actionLabel}
              </>
            )}
          </button>

          {message && status !== "loading" && (
            <p
              className={`mt-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                status === "error"
                  ? "bg-red-50 text-[var(--danger)]"
                  : status === "done"
                    ? "bg-moss-soft text-moss-deep"
                    : "bg-mist text-ink-soft"
              }`}
            >
              {message}
            </p>
          )}
        </aside>
      </div>
    </ToolPageShell>
  );
}
