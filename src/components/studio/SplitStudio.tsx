"use client";

import { useEffect, useState } from "react";
import { Scissors } from "@phosphor-icons/react";
import { PdfStudioShell } from "./PdfStudioShell";
import { usePdfPages } from "@/hooks/usePdfPages";
import { splitPdf, type SplitRange } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";

export function SplitStudio() {
  const studio = usePdfPages();
  const [mode, setMode] = useState<"pages" | "ranges">("ranges");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("1");
  const [ranges, setRanges] = useState<SplitRange[]>([]);
  const [mergeRanges, setMergeRanges] = useState(false);

  const pageCount = studio.pages.length;

  useEffect(() => {
    if (pageCount > 0) {
      setFrom("1");
      setTo(String(pageCount));
    }
  }, [pageCount, studio.file?.name]);

  const addRange = () => {
    const f = Number(from);
    const t = Number(to);
    if (!Number.isFinite(f) || !Number.isFinite(t) || f < 1 || t < f || t > pageCount) {
      studio.setStatus("error");
      studio.setMessage(`Enter a valid range between 1 and ${pageCount}.`);
      return;
    }
    setRanges((prev) => [...prev, { from: f, to: t }]);
    studio.setStatus("idle");
    studio.setMessage(`Range ${f}–${t} added`);
  };

  const run = async () => {
    if (!studio.file) return;
    studio.setStatus("working");
    studio.setMessage("Splitting PDF…");
    try {
      const activeRanges =
        ranges.length > 0
          ? ranges
          : [
              {
                from: Math.min(Number(from) || 1, pageCount),
                to: Math.min(Number(to) || pageCount, pageCount),
              },
            ];

      const blob = await splitPdf(studio.file, {
        mode,
        ranges: activeRanges,
        mergeRanges: mode === "ranges" ? mergeRanges : false,
      });

      const name =
        mode === "ranges" && mergeRanges
          ? `${basename(studio.file.name)}-split.pdf`
          : `${basename(studio.file.name)}-split.zip`;
      downloadBlob(blob, name);
      studio.setStatus("done");
      studio.setMessage(`Downloaded ${name} · ${formatBytes(blob.size)}`);
    } catch (err) {
      studio.setStatus("error");
      studio.setMessage(err instanceof Error ? err.message : "Split failed.");
    }
  };

  return (
    <PdfStudioShell
      title="Split PDF"
      blurb="By page or by range"
      accent="#E67E22"
      Icon={Scissors}
      file={studio.file}
      pages={studio.pages}
      status={studio.status}
      message={studio.message}
      actionLabel="Split PDF"
      onAction={run}
      onClear={() => {
        studio.clear();
        setRanges([]);
      }}
      onFile={(f) => {
        setRanges([]);
        void studio.loadFile(f);
      }}
      sidebar={
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Split options</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Choose how to divide the document.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
            {(
              [
                ["ranges", "Ranges"],
                ["pages", "Pages"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  mode === id ? "bg-ink text-paper" : "text-ink-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "pages" ? (
            <p className="text-sm leading-relaxed text-ink-soft">
              Each page becomes its own PDF inside a ZIP
              {pageCount ? ` (${pageCount} files)` : ""}.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <span className="font-medium text-ink">From</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount || 1}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-moss"
                  />
                </label>
                <label className="text-sm">
                  <span className="font-medium text-ink">To</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount || 1}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-moss"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={addRange}
                className="w-full rounded-xl border border-dashed border-moss/50 px-3 py-2 text-sm font-semibold text-moss"
              >
                + Add range
              </button>
              {ranges.length > 0 && (
                <ul className="space-y-1 text-xs text-ink-soft">
                  {ranges.map((r, i) => (
                    <li
                      key={`${r.from}-${r.to}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-mist px-3 py-2"
                    >
                      <span>
                        Range {i + 1}: pages {r.from}–{r.to}
                      </span>
                      <button
                        type="button"
                        className="text-[var(--danger)]"
                        onClick={() =>
                          setRanges((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={mergeRanges}
                  onChange={(e) => setMergeRanges(e.target.checked)}
                  className="accent-[var(--moss)]"
                />
                Merge ranges into one PDF
              </label>
            </div>
          )}
        </div>
      }
    />
  );
}
