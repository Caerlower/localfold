"use client";

import { useState } from "react";
import { NumberCircleOne } from "@phosphor-icons/react";
import { PdfStudioShell } from "./PdfStudioShell";
import { PositionGrid } from "./PositionGrid";
import { usePdfPages } from "@/hooks/usePdfPages";
import { addPageNumbers } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";
import { gridDotClass, type GridPos } from "@/lib/pdfStudio";

export function PageNumbersStudio() {
  const studio = usePdfPages();
  const [position, setPosition] = useState<GridPos>("bottom-center");
  const [startAt, setStartAt] = useState("1");

  const run = async () => {
    if (!studio.file) return;
    studio.setStatus("working");
    studio.setMessage("Adding page numbers…");
    try {
      const bytes = await addPageNumbers(studio.file, {
        position,
        startAt: Math.max(1, Number(startAt) || 1),
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(studio.file.name)}-numbered.pdf`;
      downloadBlob(blob, name);
      studio.setStatus("done");
      studio.setMessage(`Downloaded ${name} · ${formatBytes(blob.size)}`);
    } catch (err) {
      studio.setStatus("error");
      studio.setMessage(err instanceof Error ? err.message : "Failed.");
    }
  };

  return (
    <PdfStudioShell
      title="Page numbers"
      blurb="Pick a corner or edge"
      accent="#E67E22"
      Icon={NumberCircleOne}
      file={studio.file}
      pages={studio.pages}
      status={studio.status}
      message={studio.message}
      actionLabel="Add page numbers"
      onAction={run}
      onClear={studio.clear}
      onFile={(f) => void studio.loadFile(f)}
      renderOverlay={() => (
        <span
          className={`pointer-events-none absolute h-3 w-3 rounded-full bg-moss shadow ${gridDotClass(position)}`}
        />
      )}
      sidebar={
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Number options</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Green dots preview the number position.
            </p>
          </div>
          <PositionGrid value={position} onChange={setPosition} />
          <label className="block text-sm">
            <span className="font-medium text-ink">First number</span>
            <input
              type="number"
              min={1}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 outline-none focus:border-moss"
            />
          </label>
        </div>
      }
    />
  );
}
