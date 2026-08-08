"use client";

import { useCallback, useState } from "react";
import { loadPdfJs, renderPageToCanvas } from "@/lib/convert/pdfjs";
import type { PdfPageThumb, StudioStatus } from "@/lib/pdfStudio";

export type UsePdfPagesOptions = {
  /** Render scale (1 ≈ 72 DPI). Default 1.1 for light thumbs; use ~2.25 for crisp studios. */
  scale?: number;
  /** Preview image format */
  format?: "jpeg" | "png";
  /** JPEG quality 0–1 */
  jpegQuality?: number;
};

export function usePdfPages(options: UsePdfPagesOptions = {}) {
  const scale = options.scale ?? 1.1;
  const format = options.format ?? "jpeg";
  const jpegQuality = options.jpegQuality ?? 0.86;

  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PdfPageThumb[]>([]);
  const [status, setStatus] = useState<StudioStatus>("idle");
  const [message, setMessage] = useState("");

  const clear = useCallback(() => {
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
      return [];
    });
    setFile(null);
    setStatus("idle");
    setMessage("");
  }, []);

  const loadFile = useCallback(
    async (next: File) => {
      if (!/\.pdf$/i.test(next.name) && next.type !== "application/pdf") {
        setStatus("error");
        setMessage("Please choose a PDF file.");
        return;
      }

      setStatus("loading");
      setMessage("Rendering page previews…");
      setFile(next);
      setPages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
        return [];
      });

      try {
        const doc = await loadPdfJs(new Uint8Array(await next.arrayBuffer()));
        const items: PdfPageThumb[] = [];
        const mime = format === "png" ? "image/png" : "image/jpeg";

        for (let i = 1; i <= doc.numPages; i += 1) {
          setMessage(`Rendering page ${i} of ${doc.numPages}…`);
          const { canvas, viewport, scale: usedScale } = await renderPageToCanvas(
            doc,
            i,
            scale,
          );
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Preview failed"))),
              mime,
              format === "jpeg" ? jpegQuality : undefined,
            );
          });
          items.push({
            id: `p-${i}-${crypto.randomUUID()}`,
            sourceIndex: i - 1,
            thumbUrl: URL.createObjectURL(blob),
            widthPt: viewport.width / usedScale,
            heightPt: viewport.height / usedScale,
          });
        }

        doc.cleanup();
        setPages(items);
        setStatus("idle");
        setMessage(`${items.length} pages loaded`);
      } catch (err) {
        console.error(err);
        setFile(null);
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "Could not open this PDF.",
        );
      }
    },
    [scale, format, jpegQuality],
  );

  return {
    file,
    pages,
    setPages,
    status,
    setStatus,
    message,
    setMessage,
    loadFile,
    clear,
  };
}
