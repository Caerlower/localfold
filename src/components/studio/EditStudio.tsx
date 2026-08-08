"use client";

import { useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { PdfStudioShell } from "./PdfStudioShell";
import { PositionGrid } from "./PositionGrid";
import { usePdfPages } from "@/hooks/usePdfPages";
import { stampText } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";
import { gridDotClass, type GridPos } from "@/lib/pdfStudio";

export function EditStudio() {
  const studio = usePdfPages();
  const [text, setText] = useState("");
  const [position, setPosition] = useState<GridPos>("top-left");
  const [fontSize, setFontSize] = useState(14);

  const run = async () => {
    if (!studio.file) return;
    if (!text.trim()) {
      studio.setStatus("error");
      studio.setMessage("Enter text to place on the PDF.");
      return;
    }
    studio.setStatus("working");
    studio.setMessage("Applying text…");
    try {
      const bytes = await stampText(studio.file, text, { position, fontSize });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(studio.file.name)}-edited.pdf`;
      downloadBlob(blob, name);
      studio.setStatus("done");
      studio.setMessage(`Downloaded ${name} · ${formatBytes(blob.size)}`);
    } catch (err) {
      studio.setStatus("error");
      studio.setMessage(err instanceof Error ? err.message : "Edit failed.");
    }
  };

  return (
    <PdfStudioShell
      title="Edit PDF"
      blurb="Stamp text on every page"
      accent="#C0392B"
      Icon={PencilSimple}
      file={studio.file}
      pages={studio.pages}
      status={studio.status}
      message={studio.message}
      actionLabel="Save changes"
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
            <h2 className="text-lg font-semibold text-ink">Edit PDF</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Add a text stamp to all pages. Full freeform editing isn’t available
              offline — this keeps everything on-device.
            </p>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-ink">Text</span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="New text"
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 outline-none focus:border-moss"
            />
          </label>
          <PositionGrid value={position} onChange={setPosition} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Size · {fontSize}pt</span>
            <input
              type="range"
              min={10}
              max={48}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--moss)]"
            />
          </label>
        </div>
      }
    />
  );
}
