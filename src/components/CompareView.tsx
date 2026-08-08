"use client";

import { useEffect, useState } from "react";
import { loadPdfJs, renderPageToCanvas } from "@/lib/convert/pdfjs";

export function CompareView({ left, right }: { left: File; right: File }) {
  const [page, setPage] = useState(1);
  const [maxPages, setMaxPages] = useState(1);
  const [leftUrl, setLeftUrl] = useState<string | null>(null);
  const [rightUrl, setRightUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let lObject: string | null = null;
    let rObject: string | null = null;

    (async () => {
      try {
        setError("");
        const [lDoc, rDoc] = await Promise.all([
          loadPdfJs(new Uint8Array(await left.arrayBuffer())),
          loadPdfJs(new Uint8Array(await right.arrayBuffer())),
        ]);
        const total = Math.max(lDoc.numPages, rDoc.numPages);
        if (!cancelled) setMaxPages(total);
        const p = Math.min(page, total);

        if (p <= lDoc.numPages) {
          const { canvas } = await renderPageToCanvas(lDoc, p, 1.25);
          lObject = canvas.toDataURL("image/jpeg", 0.9);
        }
        if (p <= rDoc.numPages) {
          const { canvas } = await renderPageToCanvas(rDoc, p, 1.25);
          rObject = canvas.toDataURL("image/jpeg", 0.9);
        }
        if (!cancelled) {
          setLeftUrl(lObject);
          setRightUrl(rObject);
        }
        lDoc.cleanup();
        rDoc.cleanup();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not render PDFs.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [left, right, page]);

  return (
    <div className="rounded-[22px] border border-line bg-paper p-5 shadow-[var(--shadow)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Side-by-side</h2>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-ink-soft">
            Page {page} / {maxPages}
          </span>
          <button
            type="button"
            disabled={page >= maxPages}
            onClick={() => setPage((p) => Math.min(maxPages, p + 1))}
            className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: left.name, url: leftUrl },
          { label: right.name, url: rightUrl },
        ].map((side) => (
          <div key={side.label} className="min-w-0">
            <p className="mb-2 truncate text-xs font-medium text-ink-soft">
              {side.label}
            </p>
            <div className="overflow-hidden rounded-xl border border-line bg-mist">
              {side.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={side.url} alt={side.label} className="w-full" />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-ink-soft">
                  No page
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
