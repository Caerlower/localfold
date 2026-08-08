"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ensurePdfWorker } from "@/lib/convert/pdfjs";
import {
  clampCropRect,
  type CropRectNorm,
  type RedactMark,
} from "@/lib/pdfStudio";

type Props = {
  doc: PDFDocumentProxy;
  pageNumber: number; // 1-based
  marks: RedactMark[];
  selectedId: string | null;
  onToggleSpan: (rect: CropRectNorm, label: string, key: string) => void;
  onSelectMark: (id: string) => void;
  onRemoveMark: (id: string) => void;
  onDraw: (rect: CropRectNorm) => void;
};

function rectFromEl(el: Element, pageEl: HTMLElement): CropRectNorm {
  const a = el.getBoundingClientRect();
  const b = pageEl.getBoundingClientRect();
  const w = Math.max(b.width, 1);
  const h = Math.max(b.height, 1);
  return clampCropRect(
    {
      x: (a.left - b.left) / w,
      y: (a.top - b.top) / h,
      w: a.width / w,
      h: a.height / h,
    },
    0.004,
  );
}

export function RedactPdfPage({
  doc,
  pageNumber,
  marks,
  selectedId,
  onToggleSpan,
  onSelectMark,
  onRemoveMark,
  onDraw,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const draftRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const draggedRef = useRef(false);
  const [draft, setDraft] = useState<CropRectNorm | null>(null);

  useEffect(() => {
    let cancelled = false;
    let textLayer: { cancel?: () => void } | null = null;

    const run = async () => {
      setReady(false);
      setError("");
      await ensurePdfWorker();
      const pdfjs = await import("pdfjs-dist");
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const host = hostRef.current;
      const canvas = canvasRef.current;
      const textDiv = textRef.current;
      if (!host || !canvas || !textDiv) return;

      // Fit page to ~820 CSS px wide for readability
      const base = page.getViewport({ scale: 1 });
      const cssWidth = Math.min(820, Math.max(480, host.parentElement?.clientWidth || 820));
      const scale = cssWidth / base.width;
      const viewport = page.getViewport({ scale });

      host.style.width = `${Math.floor(viewport.width)}px`;
      host.style.height = `${Math.floor(viewport.height)}px`;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      const task = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        intent: "display",
      } as Parameters<typeof page.render>[0]);
      await task.promise;
      if (cancelled) return;

      // Official TextLayer — spans align with painted glyphs
      textDiv.replaceChildren();
      textDiv.style.setProperty("--scale-factor", String(scale));
      textDiv.style.setProperty("--total-scale-factor", String(scale));

      const content = await page.getTextContent();
      const layer = new pdfjs.TextLayer({
        textContentSource: content,
        container: textDiv,
        viewport,
      });
      textLayer = layer;
      await layer.render();
      if (cancelled) return;

      // Tag spans for click targeting
      const spans = textDiv.querySelectorAll("span");
      spans.forEach((span, i) => {
        const el = span as HTMLElement;
        if (!el.textContent?.trim()) return;
        el.dataset.lfKey = `p${pageNumber}-s${i}`;
        el.dataset.lfText = el.textContent.trim().slice(0, 80);
      });

      setReady(true);
    };

    void run().catch((err) => {
      console.error(err);
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to render page");
      }
    });

    return () => {
      cancelled = true;
      try {
        textLayer?.cancel?.();
      } catch {
        /* ignore */
      }
    };
  }, [doc, pageNumber]);

  // Sync marked class onto text spans
  useEffect(() => {
    const textDiv = textRef.current;
    if (!textDiv) return;
    const markedKeys = new Set(
      marks.map((m) => m.textId).filter(Boolean) as string[],
    );
    textDiv.querySelectorAll<HTMLElement>("span[data-lf-key]").forEach((span) => {
      const key = span.dataset.lfKey || "";
      span.classList.toggle("lf-marked", markedKeys.has(key));
    });
  }, [marks, ready]);

  const toNorm = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    if (!host) return { x: 0, y: 0 };
    const b = host.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - b.left) / Math.max(b.width, 1))),
      y: Math.min(1, Math.max(0, (clientY - b.top) / Math.max(b.height, 1))),
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-mark]")) return;
    // Start a cover-box drag (works on logos, images, and empty areas)
    draggedRef.current = false;
    const p = toNorm(e.clientX, e.clientY);
    draftRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = draftRef.current;
    if (!d) return;
    e.preventDefault();
    const p = toNorm(e.clientX, e.clientY);
    d.x1 = p.x;
    d.y1 = p.y;
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w > 0.01 || h > 0.01) draggedRef.current = true;
    setDraft({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = draftRef.current;
    const wasDrag = draggedRef.current;
    draftRef.current = null;
    setDraft(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draggedRef.current = false;

    const host = hostRef.current;
    if (!host) return;

    // Tap a word → precise text mark (no drag)
    // Use elementFromPoint — pointer capture retargets e.target to the host
    if (!wasDrag) {
      const under = document.elementFromPoint(e.clientX, e.clientY) as
        | HTMLElement
        | null;
      const span = under?.closest("span[data-lf-key]") as HTMLElement | null;
      if (span && host.contains(span)) {
        const key = span.dataset.lfKey || "";
        const label = span.dataset.lfText || span.textContent?.trim() || "Text";
        onToggleSpan(rectFromEl(span, host), label, key);
      }
      return;
    }

    if (!d) return;
    const box = {
      x: Math.min(d.x0, d.x1),
      y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0),
      h: Math.abs(d.y1 - d.y0),
    };
    if (box.w < 0.012 || box.h < 0.008) return;

    // Cover box works for logos, images, vector art, and text
    onDraw(clampCropRect(box, 0.008));
  };

  return (
    <div
      ref={hostRef}
      className="lf-redact-page relative mx-auto cursor-crosshair bg-white shadow-lg"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      <div ref={textRef} className="lf-textLayer absolute inset-0" />

      {/* Confirmed marks overlay */}
      {marks.map((m) => {
        const selected = m.id === selectedId;
        return (
          <div
            key={m.id}
            data-mark
            role="button"
            tabIndex={0}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectMark(m.id);
            }}
            className="absolute z-10"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.w * 100}%`,
              height: `${m.h * 100}%`,
              background: selected
                ? "rgba(43,125,233,0.28)"
                : "rgba(192,57,43,0.4)",
              border: selected ? "2px solid #2B7DE9" : "1.5px solid #c0392b",
            }}
          >
            {selected && (
              <button
                type="button"
                data-mark
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMark(m.id);
                }}
                className="absolute left-1/2 top-full z-20 mt-2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md hover:text-[var(--danger)]"
                aria-label="Delete mark"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {draft && draft.w > 0 && draft.h > 0 && (
        <div
          className="pointer-events-none absolute z-20 border-2 border-[#2B7DE9] bg-[#2B7DE9]/25"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.w * 100}%`,
            height: `${draft.h * 100}%`,
          }}
        />
      )}

      {!ready && !error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 text-sm text-ink-soft">
          Rendering page {pageNumber}…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-red-50 p-4 text-center text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
    </div>
  );
}
