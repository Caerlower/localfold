import JSZip from "jszip";
import { PDFDocument, degrees, rgb, StandardFonts } from "@/lib/pdf";
import { gridAnchor, type GridPos } from "@/lib/pdfStudio";
import { loadPdfJs, renderPageToCanvas } from "./pdfjs";

/**
 * Merge PDFs onto a uniform page size so mixed Letter/A4/image-PDFs
 * don't look tiny next to huge pages in the viewer.
 * Each page is scaled to fit (aspect ratio kept) and centered.
 */
export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error("Add at least two PDFs to merge.");

  const sources = await Promise.all(
    files.map(async (file) => PDFDocument.load(await file.arrayBuffer())),
  );

  // Uniform canvas = first page of the first file (predictable “same size” result)
  const { width: targetW, height: targetH } = sources[0].getPage(0).getSize();
  if (!(targetW > 0 && targetH > 0)) {
    throw new Error("Could not read page size from the first PDF.");
  }

  const out = await PDFDocument.create();
  out.setProducer("LocalFold (local-only)");
  out.setCreator("LocalFold");
  out.setTitle("Merged PDF");

  for (const src of sources) {
    for (const index of src.getPageIndices()) {
      const embedded = await out.embedPage(src.getPage(index));
      const srcW = embedded.width;
      const srcH = embedded.height;

      const page = out.addPage([targetW, targetH]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: targetW,
        height: targetH,
        color: rgb(1, 1, 1),
      });

      const scale = Math.min(targetW / srcW, targetH / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;

      page.drawPage(embedded, {
        x: (targetW - drawW) / 2,
        y: (targetH - drawH) / 2,
        xScale: scale,
        yScale: scale,
      });
    }
  }

  return out.save({ useObjectStreams: true });
}

export type SplitRange = { from: number; to: number }; // 1-based inclusive

export async function splitPdf(
  file: File,
  options?: {
    mode?: "pages" | "ranges";
    ranges?: SplitRange[];
    mergeRanges?: boolean;
  },
): Promise<Blob> {
  const src = await PDFDocument.load(await file.arrayBuffer());
  const pageCount = src.getPageCount();
  if (!pageCount) throw new Error("This PDF has no pages.");

  const zip = new JSZip();
  const base = file.name.replace(/\.pdf$/i, "") || "document";
  const mode = options?.mode ?? "pages";

  if (mode === "pages") {
    for (let index = 0; index < pageCount; index += 1) {
      const doc = await PDFDocument.create();
      const [page] = await doc.copyPages(src, [index]);
      doc.addPage(page);
      zip.file(
        `${base}-page-${index + 1}.pdf`,
        await doc.save({ useObjectStreams: true }),
      );
    }
    return zip.generateAsync({ type: "blob" });
  }

  const ranges = (options?.ranges || []).filter(
    (r) => r.from >= 1 && r.to >= r.from && r.to <= pageCount,
  );
  if (!ranges.length) throw new Error("Add at least one valid page range.");

  if (options?.mergeRanges) {
    const out = await PDFDocument.create();
    for (const range of ranges) {
      const indices = Array.from(
        { length: range.to - range.from + 1 },
        (_, i) => range.from - 1 + i,
      );
      const pages = await out.copyPages(src, indices);
      pages.forEach((p) => out.addPage(p));
    }
    const bytes = await out.save({ useObjectStreams: true });
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  }

  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    const doc = await PDFDocument.create();
    const indices = Array.from(
      { length: range.to - range.from + 1 },
      (_, j) => range.from - 1 + j,
    );
    const pages = await doc.copyPages(src, indices);
    pages.forEach((p) => doc.addPage(p));
    zip.file(
      `${base}-range-${i + 1}-p${range.from}-${range.to}.pdf`,
      await doc.save({ useObjectStreams: true }),
    );
  }
  return zip.generateAsync({ type: "blob" });
}

/** Rebuild PDF using an explicit 0-based page order (after drag/delete in UI). */
export async function organizePdf(
  file: File,
  options: { pageOrder: number[] },
): Promise<Uint8Array> {
  const order = options.pageOrder.filter((n) => Number.isInteger(n) && n >= 0);
  if (!order.length) throw new Error("Keep at least one page.");

  const src = await PDFDocument.load(await file.arrayBuffer());
  const max = src.getPageCount();
  for (const i of order) {
    if (i < 0 || i >= max) throw new Error(`Invalid page index: ${i + 1}`);
  }

  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p) => out.addPage(p));
  out.setProducer("LocalFold (local-only)");
  out.setCreator("LocalFold");
  return out.save({ useObjectStreams: true });
}

export async function repairPdf(file: File): Promise<Uint8Array> {
  const src = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
  });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  out.setProducer("LocalFold repair");
  return out.save({ useObjectStreams: true });
}

export type PdfImagePage = { blob: Blob; filename: string };

/** Render each PDF page to a high-res image (PNG or JPEG). */
export async function pdfToImages(
  file: File,
  format: "png" | "jpeg" = "png",
  onProgress?: (msg: string) => void,
): Promise<PdfImagePage[]> {
  const { EXPORT_SCALE, JPEG_QUALITY } = await import("./quality");
  const doc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  const base = file.name.replace(/\.pdf$/i, "") || "page";
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const ext = format === "png" ? "png" : "jpg";
  const pages: PdfImagePage[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    onProgress?.(`Rendering page ${i} of ${doc.numPages}…`);
    const { canvas } = await renderPageToCanvas(doc, i, EXPORT_SCALE);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to export page."))),
        mime,
        format === "jpeg" ? JPEG_QUALITY : undefined,
      );
    });
    const filename =
      doc.numPages === 1 ? `${base}.${ext}` : `${base}-page-${i}.${ext}`;
    pages.push({ blob, filename });
  }
  doc.cleanup();
  return pages;
}

export async function pdfToImagesZip(
  file: File,
  format: "png" | "jpeg" = "png",
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  const pages = await pdfToImages(file, format, onProgress);
  const zip = new JSZip();
  for (const page of pages) {
    zip.file(page.filename, page.blob);
  }
  onProgress?.("Packaging ZIP…");
  return zip.generateAsync({ type: "blob" });
}

/** Normalize degrees to 0 | 90 | 180 | 270. */
function normQuarterTurns(angle: number): 0 | 90 | 180 | 270 {
  const d = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return d as 0 | 90 | 180 | 270;
}

/**
 * Rotate PDF pages.
 * - `angle`: apply the same delta to every page
 * - `pageAngles`: per-page deltas (index → degrees). Overrides `angle` when set.
 */
export async function rotatePdf(
  file: File,
  angle: number = 90,
  pageAngles?: ReadonlyArray<number> | Record<number, number>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const pages = doc.getPages();

  let any = false;
  pages.forEach((page, i) => {
    let delta = 0;
    if (pageAngles) {
      const raw = Array.isArray(pageAngles)
        ? pageAngles[i]
        : pageAngles[i];
      delta = normQuarterTurns(raw ?? 0);
    } else {
      delta = normQuarterTurns(angle);
    }
    if (delta === 0) return;
    any = true;
    page.setRotation(degrees((page.getRotation().angle + delta) % 360));
  });

  if (!any) {
    return new Uint8Array(await file.arrayBuffer());
  }

  doc.setProducer("LocalFold (local-only)");
  return doc.save({ useObjectStreams: true });
}

export async function addPageNumbers(
  file: File,
  options?: { position?: GridPos; startAt?: number },
): Promise<Uint8Array> {
  const position = options?.position ?? "bottom-center";
  const startAt = options?.startAt ?? 1;
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const label = `${startAt + i}`;
    const size = 11;
    const textWidth = font.widthOfTextAtSize(label, size);
    const { x, y } = gridAnchor(position, width, height, textWidth, size, 28);
    page.drawText(label, {
      x,
      y,
      size,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
  });
  return doc.save({ useObjectStreams: true });
}

export type WatermarkOptions = {
  text: string;
  position?: GridPos;
  opacity?: number;
  rotation?: number;
  fontSize?: number;
  mosaic?: boolean;
};

export async function addWatermark(
  file: File,
  textOrOptions: string | WatermarkOptions,
): Promise<Uint8Array> {
  const opts: WatermarkOptions =
    typeof textOrOptions === "string"
      ? { text: textOrOptions }
      : textOrOptions;
  const text = opts.text?.trim();
  if (!text) throw new Error("Enter watermark text.");

  const position = opts.position ?? "middle-center";
  const opacity = opts.opacity ?? 0.28;
  const rotation = opts.rotation ?? 0;
  const mosaic = Boolean(opts.mosaic);

  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size =
      opts.fontSize ?? Math.max(18, Math.min(width, height) * 0.07);
    const textWidth = font.widthOfTextAtSize(text, size);

    const drawOne = (x: number, y: number) => {
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0.55, 0.55, 0.55),
        opacity,
        rotate: degrees(rotation),
      });
    };

    if (mosaic) {
      const stepX = Math.max(textWidth + 48, width / 3);
      const stepY = Math.max(size * 3, height / 4);
      for (let y = 40; y < height; y += stepY) {
        for (let x = 24; x < width; x += stepX) {
          drawOne(x, y);
        }
      }
    } else {
      const { x, y } = gridAnchor(position, width, height, textWidth, size, 40);
      drawOne(x, y);
    }
  }
  return doc.save({ useObjectStreams: true });
}

export async function stampText(
  file: File,
  text: string,
  options?: { position?: GridPos; fontSize?: number },
): Promise<Uint8Array> {
  if (!text.trim()) throw new Error("Enter text to stamp.");
  const position = options?.position ?? "top-left";
  const fontSize = options?.fontSize ?? 14;
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const { x, y } = gridAnchor(position, width, height, textWidth, fontSize, 40);
    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return doc.save({ useObjectStreams: true });
}

export async function signPdf(file: File, name: string): Promise<Uint8Array> {
  if (!name.trim()) throw new Error("Enter a signature name.");
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  page.drawText(`Signed: ${name}`, {
    x: 72,
    y: 72,
    size: 18,
    font,
    color: rgb(0.05, 0.15, 0.35),
  });
  page.drawText(new Date().toLocaleString(), {
    x: 72,
    y: 52,
    size: 10,
    font: await doc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.35, 0.35, 0.35),
  });
  return doc.save({ useObjectStreams: true });
}

export type CropPdfOptions = {
  /** Normalized rect (top-left origin, 0–1). */
  rect: { x: number; y: number; w: number; h: number };
  /** Apply to every page, or only `pageIndex`. */
  scope: "all" | "current";
  /** 0-based page index when scope is `current`. */
  pageIndex?: number;
};

/**
 * Crop via CropBox. `rect` is normalized to each page’s size (top-left UI
 * coords → PDF bottom-left crop box).
 */
export async function cropPdf(
  file: File,
  options: CropPdfOptions | number = 36,
): Promise<Uint8Array> {
  // Legacy: uniform margin in points
  if (typeof options === "number") {
    const margin = options;
    const doc = await PDFDocument.load(await file.arrayBuffer());
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const m = Math.min(margin, width / 4, height / 4);
      page.setCropBox(m, m, width - m * 2, height - m * 2);
    }
    return doc.save({ useObjectStreams: true });
  }

  const { rect, scope, pageIndex = 0 } = options;
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const pages = doc.getPages();

  const apply = (page: (typeof pages)[number]) => {
    const { width, height } = page.getSize();
    const x = Math.max(0, Math.min(width, rect.x * width));
    const w = Math.max(1, Math.min(width - x, rect.w * width));
    const top = Math.max(0, Math.min(height, rect.y * height));
    const h = Math.max(1, Math.min(height - top, rect.h * height));
    // PDF crop box origin is bottom-left
    const y = height - top - h;
    page.setCropBox(x, y, w, h);
  };

  if (scope === "current") {
    const page = pages[pageIndex];
    if (!page) throw new Error("Selected page is out of range.");
    apply(page);
  } else {
    for (const page of pages) apply(page);
  }

  return doc.save({ useObjectStreams: true });
}

export async function protectPdf(
  file: File,
  password: string,
): Promise<Uint8Array> {
  if (!password) throw new Error("Enter a password.");
  const doc = await PDFDocument.load(await file.arrayBuffer());
  doc.encrypt({
    userPassword: password,
    ownerPassword: password,
  });
  return doc.save({ useObjectStreams: true });
}

export async function unlockPdf(
  file: File,
  password: string,
): Promise<Uint8Array> {
  if (!password) throw new Error("Enter the PDF password.");
  const doc = await PDFDocument.load(await file.arrayBuffer(), {
    password,
    ignoreEncryption: false,
  });
  // Re-save without encryption
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  out.setProducer("LocalFold unlock");
  return out.save({ useObjectStreams: true });
}

/** Normalized redaction region (top-left origin, 0–1 of page size). */
export type RedactRegion = {
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RedactPdfOptions = {
  /** Drawn / listed regions to black out */
  regions?: RedactRegion[];
  /** Also find and redact every match of this phrase */
  phrase?: string;
};

/**
 * Black out regions (and optional text matches). Regions use normalized
 * top-left coords; PDF drawing uses bottom-left points.
 */
export async function redactPdf(
  file: File,
  options: string | RedactPdfOptions,
): Promise<Uint8Array> {
  const { findTextRects } = await import("./pdfjs");
  const regions: RedactRegion[] = [];

  const phrase =
    typeof options === "string" ? options : options.phrase?.trim() || "";
  const drawn =
    typeof options === "string" ? [] : options.regions?.slice() || [];

  regions.push(...drawn);

  if (phrase) {
    const hits = await findTextRects(file, phrase);
    const docProbe = await PDFDocument.load(await file.arrayBuffer());
    for (const hit of hits) {
      const page = docProbe.getPages()[hit.pageIndex];
      if (!page) continue;
      const { width, height } = page.getSize();
      if (width <= 0 || height <= 0) continue;
      regions.push({
        pageIndex: hit.pageIndex,
        x: hit.x / width,
        y: 1 - (hit.y + hit.h) / height,
        w: hit.w / width,
        h: hit.h / height,
      });
    }
  }

  if (!regions.length) {
    throw new Error(
      phrase
        ? "That text was not found — draw boxes or try another phrase."
        : "Mark areas to redact first (draw or search).",
    );
  }

  const doc = await PDFDocument.load(await file.arrayBuffer());
  const pages = doc.getPages();
  for (const r of regions) {
    const page = pages[r.pageIndex];
    if (!page) continue;
    const { width, height } = page.getSize();
    const x = Math.max(0, r.x * width);
    const h = Math.max(1, r.h * height);
    const w = Math.max(1, r.w * width);
    const y = height - r.y * height - h;
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(0, 0, 0),
      borderWidth: 0,
    });
  }
  doc.setProducer("LocalFold redact (local-only)");
  return doc.save({ useObjectStreams: true });
}

export async function pdfToMarkdown(file: File): Promise<Blob> {
  const { loadPdfJs, extractPageLines } = await import("./pdfjs");
  const pdf = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  const parts: string[] = [];
  let textChars = 0;

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const { lines } = await extractPageLines(page);
    const sizes = lines.map((l) => l.fontSize).filter(Boolean);
    const median =
      [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)] || 11;

    parts.push(`## Page ${i}\n`);
    if (!lines.length) {
      parts.push("_No text on this page._\n");
      continue;
    }
    for (const line of lines) {
      const t = line.text.trim();
      if (!t) continue;
      textChars += t.length;
      if (line.fontSize >= median * 1.45) parts.push(`\n### ${t}\n`);
      else if (line.fontSize >= median * 1.2) parts.push(`\n**${t}**\n`);
      else parts.push(`${t}  `); // markdown line break
    }
    parts.push("\n");
  }
  pdf.cleanup();
  if (textChars === 0) {
    throw new Error(
      "No extractable text found. For scans/images, run OCR PDF first.",
    );
  }
  return new Blob([parts.join("\n")], { type: "text/markdown" });
}
