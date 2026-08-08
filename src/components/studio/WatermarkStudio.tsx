"use client";

import { useState } from "react";
import { DropHalf } from "@phosphor-icons/react";
import { PdfStudioShell } from "./PdfStudioShell";
import { PositionGrid } from "./PositionGrid";
import { usePdfPages } from "@/hooks/usePdfPages";
import { addWatermark } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";
import { gridDotClass, type GridPos } from "@/lib/pdfStudio";

export function WatermarkStudio() {
  const studio = usePdfPages();
  const [text, setText] = useState("CONFIDENTIAL");
  const [position, setPosition] = useState<GridPos>("middle-center");
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(0);
  const [mosaic, setMosaic] = useState(false);

  const run = async () => {
    if (!studio.file) return;
    if (!text.trim()) {
      studio.setStatus("error");
      studio.setMessage("Enter watermark text.");
      return;
    }
    studio.setStatus("working");
    studio.setMessage("Adding watermark…");
    try {
      const bytes = await addWatermark(studio.file, {
        text,
        position,
        opacity,
        rotation,
        mosaic,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(studio.file.name)}-watermarked.pdf`;
      downloadBlob(blob, name);
      studio.setStatus("done");
      studio.setMessage(`Downloaded ${name} · ${formatBytes(blob.size)}`);
    } catch (err) {
      studio.setStatus("error");
      studio.setMessage(err instanceof Error ? err.message : "Watermark failed.");
    }
  };

  return (
    <PdfStudioShell
      title="Watermark"
      blurb="Text overlay with live preview"
      accent="#9B59B6"
      Icon={DropHalf}
      file={studio.file}
      pages={studio.pages}
      status={studio.status}
      message={studio.message}
      actionLabel="Add watermark"
      onAction={run}
      onClear={studio.clear}
      onFile={(f) => void studio.loadFile(f)}
      renderOverlay={() =>
        !mosaic ? (
          <span
            className={`pointer-events-none absolute h-3 w-3 rounded-full bg-moss shadow ${gridDotClass(position)}`}
          />
        ) : (
          <span className="pointer-events-none absolute inset-2 rounded-lg border border-dashed border-moss/50" />
        )
      }
      sidebar={
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Watermark options</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Place text on every page. Dots show the position.
            </p>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-ink">Text</span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 outline-none focus:border-moss"
            />
          </label>

          {!mosaic && (
            <PositionGrid value={position} onChange={setPosition} />
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={mosaic}
              onChange={(e) => setMosaic(e.target.checked)}
              className="accent-[var(--moss)]"
            />
            Mosaic (repeat across page)
          </label>

          <label className="block text-sm">
            <span className="font-medium text-ink">
              Transparency · {Math.round(opacity * 100)}%
            </span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--moss)]"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-ink">Rotation · {rotation}°</span>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--moss)]"
            />
          </label>
        </div>
      }
    />
  );
}
