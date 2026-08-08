"use client";

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { PdfStudioShell } from "./PdfStudioShell";
import { usePdfPages } from "@/hooks/usePdfPages";
import { rotatePdf } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";

type Mode = "all" | "one";

function turnsToDegrees(turns: number): number {
  return (((turns % 4) + 4) % 4) * 90;
}

export function RotateStudio() {
  const studio = usePdfPages();
  const [mode, setMode] = useState<Mode>("all");
  /** Per-page cumulative 90° clockwise turns. */
  const [pageTurns, setPageTurns] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);

  // Keep pageTurns aligned with loaded pages
  useEffect(() => {
    setPageTurns((prev) => {
      const n = studio.pages.length;
      if (n === 0) return [];
      if (prev.length === n) return prev;
      const next = Array.from({ length: n }, (_, i) => prev[i] ?? 0);
      return next;
    });
    setSelected((s) =>
      studio.pages.length ? Math.min(s, studio.pages.length - 1) : 0,
    );
  }, [studio.pages.length]);

  const hasChanges = useMemo(
    () => pageTurns.some((t) => turnsToDegrees(t) !== 0),
    [pageTurns],
  );

  const rotateDelta = (delta: 1 | -1) => {
    if (!studio.pages.length) return;
    setPageTurns((prev) => {
      const next = prev.length
        ? [...prev]
        : Array.from({ length: studio.pages.length }, () => 0);
      if (mode === "all") {
        for (let i = 0; i < next.length; i += 1) next[i] += delta;
      } else {
        const i = selected;
        if (i >= 0 && i < next.length) next[i] += delta;
      }
      return next;
    });
  };

  const resetAll = () => {
    setPageTurns(Array.from({ length: studio.pages.length }, () => 0));
  };

  const run = async () => {
    if (!studio.file) return;
    if (!hasChanges) {
      studio.setStatus("error");
      studio.setMessage("Rotate at least one page with Right or Left first.");
      return;
    }
    studio.setStatus("working");
    studio.setMessage("Rotating pages…");
    try {
      const angles = pageTurns.map((t) => turnsToDegrees(t));
      const bytes = await rotatePdf(studio.file, 0, angles);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(studio.file.name)}-rotated.pdf`;
      downloadBlob(blob, name);
      studio.setStatus("done");
      studio.setMessage(`Downloaded ${name} · ${formatBytes(blob.size)}`);
    } catch (err) {
      studio.setStatus("error");
      studio.setMessage(err instanceof Error ? err.message : "Rotate failed.");
    }
  };

  const clear = () => {
    setPageTurns([]);
    setSelected(0);
    setMode("all");
    studio.clear();
  };

  const scopeLabel =
    mode === "all"
      ? "all pages"
      : `page ${selected + 1}`;

  return (
    <PdfStudioShell
      title="Rotate PDF"
      blurb="All pages, or one page at a time"
      accent="#0f8a5f"
      Icon={ArrowsClockwise}
      file={studio.file}
      pages={studio.pages}
      status={studio.status}
      message={studio.message}
      actionLabel="Rotate PDF"
      onAction={run}
      onClear={clear}
      onFile={(f) => {
        setPageTurns([]);
        setSelected(0);
        setMode("all");
        void studio.loadFile(f);
      }}
      actionDisabled={!hasChanges}
      pageImageStyle={(_page, index) => ({
        transform: `rotate(${(pageTurns[index] ?? 0) * 90}deg)`,
      })}
      isPageSelected={(_page, index) => mode === "one" && index === selected}
      onPageClick={
        mode === "one"
          ? (_page, index) => setSelected(index)
          : undefined
      }
      renderPageFooter={(_page, index) => {
        const deg = turnsToDegrees(pageTurns[index] ?? 0);
        if (deg === 0 && mode !== "one") return null;
        return (
          <div className="mt-1.5 flex items-center justify-center gap-1">
            {mode === "one" && (
              <>
                <button
                  type="button"
                  title="Rotate this page left"
                  aria-label={`Rotate page ${index + 1} left`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(index);
                    setPageTurns((prev) => {
                      const next = [...prev];
                      next[index] = (next[index] ?? 0) - 1;
                      return next;
                    });
                  }}
                  className="rounded-lg border border-line bg-mist p-1.5 text-ink-soft hover:bg-moss-soft hover:text-moss-deep"
                >
                  <ArrowCounterClockwise className="h-3.5 w-3.5" weight="bold" />
                </button>
                <button
                  type="button"
                  title="Rotate this page right"
                  aria-label={`Rotate page ${index + 1} right`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(index);
                    setPageTurns((prev) => {
                      const next = [...prev];
                      next[index] = (next[index] ?? 0) + 1;
                      return next;
                    });
                  }}
                  className="rounded-lg border border-line bg-mist p-1.5 text-ink-soft hover:bg-moss-soft hover:text-moss-deep"
                >
                  <ArrowClockwise className="h-3.5 w-3.5" weight="bold" />
                </button>
              </>
            )}
            {deg !== 0 && (
              <span className="rounded-full bg-moss-soft px-2 py-0.5 text-[10px] font-semibold text-moss-deep">
                {deg}°
              </span>
            )}
          </div>
        );
      }}
      sidebar={
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Rotation</h2>
            <button
              type="button"
              onClick={resetAll}
              disabled={!hasChanges}
              className="text-sm font-medium text-moss underline underline-offset-2 hover:text-moss-deep disabled:opacity-40"
            >
              Reset all
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
            <ModeTab
              active={mode === "all"}
              onClick={() => setMode("all")}
              label="All pages"
            />
            <ModeTab
              active={mode === "one"}
              onClick={() => setMode("one")}
              label="One page"
            />
          </div>

          {mode === "one" && (
            <p className="text-xs text-ink-soft">
              Select a page, then use Right / Left.
            </p>
          )}

          <div className="flex flex-col gap-3">
            <RotateDirectionButton
              label="RIGHT"
              ariaLabel={`Rotate ${scopeLabel} right (clockwise)`}
              onClick={() => rotateDelta(1)}
              Icon={ArrowClockwise}
            />
            <RotateDirectionButton
              label="LEFT"
              ariaLabel={`Rotate ${scopeLabel} left (counter-clockwise)`}
              onClick={() => rotateDelta(-1)}
              Icon={ArrowCounterClockwise}
            />
          </div>

          {hasChanges && mode === "one" && (
            <p className="text-xs text-ink-soft">
              Page {selected + 1} selected
            </p>
          )}
        </div>
      }
    />
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
        active
          ? "bg-paper text-ink shadow-[var(--shadow-sm)]"
          : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function RotateDirectionButton({
  label,
  ariaLabel,
  onClick,
  Icon,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  Icon: typeof ArrowClockwise;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex w-full overflow-hidden rounded-xl bg-paper shadow-[var(--shadow)] ring-1 ring-black/5 transition hover:shadow-[var(--shadow-hover)] active:scale-[0.99]"
    >
      <span className="flex w-14 shrink-0 items-center justify-center bg-moss text-paper">
        <Icon className="h-6 w-6" weight="bold" />
      </span>
      <span className="flex flex-1 items-center px-5 py-3.5 text-left text-base font-semibold tracking-wide text-ink">
        {label}
      </span>
    </button>
  );
}
