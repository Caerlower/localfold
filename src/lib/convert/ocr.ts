import { PDFDocument, StandardFonts, rgb } from "@/lib/pdf";
import { loadPdfJs, renderPageToCanvas } from "./pdfjs";

export async function ocrPdf(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Uint8Array> {
  const { createWorker } = await import("tesseract.js");

  onProgress?.("Starting on-device OCR…");

  const worker = await createWorker("eng", 1, {
    workerPath: "/tessdata/worker.min.js",
    corePath: "/tessdata/core",
    langPath: "/tessdata",
    gzip: true,
  });

  try {
    const srcDoc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
    const out = await PDFDocument.create();
    out.setProducer("LocalFold OCR (local)");
    const font = await out.embedFont(StandardFonts.Helvetica);
    const pageCount = srcDoc.numPages;

    for (let i = 1; i <= pageCount; i += 1) {
      onProgress?.(`OCR page ${i} of ${pageCount}…`);
      const { canvas } = await renderPageToCanvas(srcDoc, i, 3);
      const {
        data: { text },
      } = await worker.recognize(canvas);

      const png = await new Promise<Uint8Array>((resolve, reject) => {
        canvas.toBlob(async (b) => {
          if (!b) return reject(new Error("OCR render failed"));
          resolve(new Uint8Array(await b.arrayBuffer()));
        }, "image/png");
      });

      const image = await out.embedPng(png);
      const page = out.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });

      const lines = (text || "").split("\n").filter(Boolean).slice(0, 40);
      let y = image.height - 14;
      for (const line of lines) {
        page.drawText(line.slice(0, 120), {
          x: 8,
          y,
          size: 4,
          font,
          color: rgb(1, 1, 1),
          opacity: 0.01,
        });
        y -= 6;
        if (y < 8) break;
      }
    }

    srcDoc.cleanup();
    return out.save({ useObjectStreams: true });
  } finally {
    await worker.terminate();
  }
}
