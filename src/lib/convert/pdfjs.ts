import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

let workerReady = false;

export async function ensurePdfWorker() {
  if (workerReady) return;
  const pdfjs = await import("pdfjs-dist");
  // Served from /public — reliable under Next.js Turbopack (import.meta.url often breaks)
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  workerReady = true;
}

async function ensureWorker() {
  return ensurePdfWorker();
}

export async function loadPdfJs(data: Uint8Array, password?: string) {
  await ensureWorker();
  const pdfjs = await import("pdfjs-dist");

  // Copy buffer — pdf.js may transfer/detach the underlying ArrayBuffer
  const copy = new Uint8Array(data);

  try {
    return await pdfjs.getDocument({
      data: copy,
      password,
      useSystemFonts: true,
      disableFontFace: false,
    }).promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/password/i.test(message)) {
      throw new Error("This PDF is password-protected. Use Unlock PDF first.");
    }
    if (/worker|failed to fetch|dynamically imported/i.test(message)) {
      throw new Error(
        "PDF engine failed to start. Hard-refresh the page (Cmd+Shift+R) and try again.",
      );
    }
    throw new Error(`Could not open PDF: ${message}`);
  }
}

export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = 2,
) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);

  // Guard against oversized canvases (browser limits ~16k–32k)
  const maxDim = 8192;
  let finalScale = scale;
  if (width > maxDim || height > maxDim) {
    finalScale = scale * (maxDim / Math.max(width, height));
  }
  const finalViewport =
    finalScale === scale ? viewport : page.getViewport({ scale: finalScale });

  canvas.width = Math.ceil(finalViewport.width);
  canvas.height = Math.ceil(finalViewport.height);

  const ctx = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
  if (!ctx) throw new Error("Canvas unavailable in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // pdf.js v4+: prefer `canvas` param (not only canvasContext)
  const task = page.render({
    canvas,
    viewport: finalViewport,
    intent: "print",
    background: "#ffffff",
  });
  await task.promise;

  return { canvas, page, viewport: finalViewport, scale: finalScale };
}

export async function canvasToBytes(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg" = "image/png",
  quality = 0.98,
): Promise<Uint8Array> {
  // Prefer PNG (lossless). For huge canvases, fall back to near-lossless JPEG
  // so browsers don't fail the encode.
  const pixels = canvas.width * canvas.height;
  let encodeType = type;
  if (type === "image/png" && pixels > 12_000_000) {
    encodeType = "image/jpeg";
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Failed to encode page image.")),
      encodeType,
      encodeType === "image/jpeg" ? quality : undefined,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export function bytesImageExt(
  type: "image/png" | "image/jpeg",
  bytes: Uint8Array,
): "png" | "jpeg" {
  // Detect actual encode fallback (PNG magic vs JPEG)
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  return type === "image/png" ? "png" : "jpeg";
}

export type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** Excel-safe font family (Arial, Times New Roman, …) */
  fontFamily: string;
  fontName: string;
};

export type TextLine = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontFamily: string;
  items: TextItem[];
};

type ResolvedFont = {
  family: string;
  bold: boolean;
  italic: boolean;
  pdfName: string;
};

/** Map PDF font names to fonts Excel can actually apply. */
export function mapPdfFontToExcel(pdfName: string): string {
  const raw = pdfName.split("+").pop() || pdfName;
  const base = raw
    .replace(
      /[-_]?(BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Medium|Light|Black|Roman|MT|PS)$/gi,
      "",
    )
    .replace(/[-_]+$/g, "")
    .trim();
  const key = base.toLowerCase();

  if (!key || key === "sans-serif" || /helvetica|arial|univers|nimbus.?sans|liberation.?sans|dejavu.?sans/.test(key)) {
    return "Arial";
  }
  if (
    key === "serif" ||
    /times|georgia|garamond|palatino|liberation.?serif|nimbus.?roman|cambria|book.?antiqua/.test(
      key,
    )
  ) {
    if (/georgia/.test(key)) return "Georgia";
    if (/garamond/.test(key)) return "Garamond";
    if (/palatino/.test(key)) return "Palatino Linotype";
    if (/cambria/.test(key)) return "Cambria";
    return "Times New Roman";
  }
  if (
    key === "monospace" ||
    /courier|consolas|menlo|monaco|liberation.?mono|nimbus.?mono|dejavu.?sans.?mono|lucida.?console/.test(
      key,
    )
  ) {
    if (/consolas/.test(key)) return "Consolas";
    return "Courier New";
  }
  if (/calibri/.test(key)) return "Calibri";
  if (/verdana/.test(key)) return "Verdana";
  if (/tahoma/.test(key)) return "Tahoma";
  if (/trebuchet/.test(key)) return "Trebuchet MS";
  if (/comic/.test(key)) return "Comic Sans MS";
  if (/segoe/.test(key)) return "Segoe UI";
  if (/roboto/.test(key)) return "Roboto";
  if (/inter/.test(key)) return "Inter";
  if (/^[A-Za-z][A-Za-z0-9 ]{1,40}$/.test(base)) return base;
  return "Arial";
}

function parseFontMeta(pdfName: string, cssFamily = ""): ResolvedFont {
  const probe = `${pdfName} ${cssFamily}`;
  return {
    pdfName,
    family: mapPdfFontToExcel(pdfName || cssFamily || "Arial"),
    bold: /bold|black|heavy|semibold|demi|extrabold|ultra/i.test(probe),
    italic: /italic|oblique/i.test(probe),
  };
}

/** Resolve pdf.js font ids (g_d0_f1) to real names like Helvetica-Bold. */
async function resolvePageFonts(
  page: PDFPageProxy,
  fontIds: string[],
  styles: Record<string, { fontFamily?: string }>,
): Promise<Map<string, ResolvedFont>> {
  const map = new Map<string, ResolvedFont>();
  if (!fontIds.length) return map;

  // Load font objects into commonObjs
  try {
    await page.getOperatorList();
  } catch {
    /* ignore */
  }

  await Promise.all(
    fontIds.map(async (id) => {
      const cssFamily = styles[id]?.fontFamily || "";
      try {
        const font = (await page.commonObjs.get(id)) as {
          name?: string;
          italic?: boolean;
          black?: boolean;
        } | null;
        const pdfName = String(font?.name || id);
        const meta = parseFontMeta(pdfName, cssFamily);
        if (font?.italic) meta.italic = true;
        if (font?.black) meta.bold = true;
        map.set(id, meta);
      } catch {
        map.set(id, parseFontMeta(id, cssFamily));
      }
    }),
  );
  return map;
}

/** PDF user-space items (origin bottom-left), grouped into reading-order lines. */
export async function extractPageLines(page: PDFPageProxy): Promise<{
  lines: TextLine[];
  pageWidth: number;
  pageHeight: number;
}> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const styles = (content.styles || {}) as Record<string, { fontFamily?: string }>;

  const fontIds = [
    ...new Set(
      content.items
        .map((raw) =>
          "fontName" in raw && raw.fontName ? String(raw.fontName) : "",
        )
        .filter(Boolean),
    ),
  ];
  const fontMap = await resolvePageFonts(page, fontIds, styles);

  const items: TextItem[] = [];

  for (const raw of content.items) {
    // Skip empty / whitespace-only runs. pdf.js injects wide " " fillers between
    // positioned words; those zero-out real column gaps and break table export.
    if (!("str" in raw) || !raw.str || !raw.str.trim()) continue;
    const tx = raw.transform;
    const fontSize = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 11;
    const glyphWidth = raw.width ?? fontSize * raw.str.length * 0.5;
    const fontName = "fontName" in raw && raw.fontName ? String(raw.fontName) : "";
    const resolved =
      fontMap.get(fontName) ||
      parseFontMeta(fontName, styles[fontName]?.fontFamily || "");
    items.push({
      str: raw.str,
      x: tx[4],
      y: tx[5],
      // Cap absurd widths from synthetic spacing so gap math stays meaningful
      width: Math.min(glyphWidth, fontSize * raw.str.length * 1.2 + fontSize),
      height: raw.height ?? fontSize,
      fontSize,
      bold: resolved.bold,
      italic: resolved.italic,
      fontFamily: resolved.family,
      fontName,
    });
  }

  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  const yTol = (size: number) => Math.max(2, size * 0.35);

  for (const item of items) {
    const last = lines[lines.length - 1];
    if (
      last &&
      Math.abs(last.y - item.y) <= yTol(Math.max(last.fontSize, item.fontSize))
    ) {
      const lastItem = last.items[last.items.length - 1];
      const gap = item.x - (lastItem.x + lastItem.width);
      const spacer = gap > item.fontSize * 0.35 ? " " : "";
      last.items.push(item);
      last.text += spacer + item.str;
      last.fontSize = Math.max(last.fontSize, item.fontSize);
      last.bold = last.bold || item.bold;
      last.italic = last.italic || item.italic;
      last.x = Math.min(last.x, item.x);
      last.y = (last.y + item.y) / 2;
    } else {
      lines.push({
        text: item.str,
        x: item.x,
        y: item.y,
        fontSize: item.fontSize,
        bold: item.bold,
        italic: item.italic,
        fontFamily: item.fontFamily,
        items: [item],
      });
    }
  }

  return {
    lines,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
  };
}

export async function extractPdfText(file: File): Promise<string[]> {
  const doc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const { lines } = await extractPageLines(page);
    pages.push(lines.map((l) => l.text).join("\n").trim());
  }
  doc.cleanup();
  return pages;
}

type VpBox = { left: number; top: number; right: number; bottom: number; text: string };
type TextRun = VpBox & {
  start: number;
  end: number;
  fontSize: number;
  fontFamily: string;
};
type NormRect = { pageIndex: number; x: number; y: number; w: number; h: number };

function mergeVpBoxes(a: VpBox, b: VpBox): VpBox {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
    text: `${a.text}${b.text}`,
  };
}

function matrixTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

async function getPdfTransform(): Promise<(m1: number[], m2: number[]) => number[]> {
  await ensureWorker();
  const pdfjs = await import("pdfjs-dist");
  return pdfjs.Util?.transform ?? matrixTransform;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === "undefined") {
    measureCtx = null;
    return null;
  }
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

/**
 * Clip a text-run box to the matched characters using font metrics.
 * Char-index fractions fail on proportional fonts (boxes slide left/right).
 */
function clipRunToMatch(
  run: TextRun,
  matchStart: number,
  matchEnd: number,
): VpBox | null {
  const overlapStart = Math.max(run.start, matchStart);
  const overlapEnd = Math.min(run.end, matchEnd);
  if (overlapEnd <= overlapStart) return null;

  const local0 = overlapStart - run.start;
  const local1 = overlapEnd - run.start;
  const runWidth = run.right - run.left;
  const matchedText = run.text.slice(local0, local1);

  let left = run.left;
  let right = run.right;

  if (local0 > 0 || local1 < run.text.length) {
    const ctx = getMeasureCtx();
    let placed = false;
    if (ctx && run.text.length > 0) {
      // Fallback stack — embedded PDF font names often aren't installed; we
      // rescale to the PDF run width so totals still match the glyphs.
      const family = run.fontFamily?.trim() || "sans-serif";
      ctx.font = `${run.fontSize}px ${family}, sans-serif`;
      const full = ctx.measureText(run.text).width;
      if (full > 0.01) {
        const scale = runWidth / full;
        const prefix = ctx.measureText(run.text.slice(0, local0)).width * scale;
        const matched = Math.max(
          ctx.measureText(matchedText).width * scale,
          run.fontSize * 0.35,
        );
        left = run.left + prefix;
        right = left + matched;
        placed = true;
      }
    }
    if (!placed) {
      // Last resort — worse on proportional fonts, but better than full run
      const runLen = Math.max(run.text.length, 1);
      left = run.left + (runWidth * local0) / runLen;
      right = run.left + (runWidth * local1) / runLen;
    }
  }

  return {
    left,
    top: run.top,
    right: Math.max(right, left + 2),
    bottom: run.bottom,
    text: matchedText,
  };
}

function pushHit(
  hits: NormRect[],
  pageIndex: number,
  box: VpBox,
  vw: number,
  vh: number,
) {
  const padX = 0.6;
  const padY = 0.4;
  const left = Math.max(0, box.left - padX);
  const top = Math.max(0, box.top - padY);
  const right = Math.min(vw, box.right + padX);
  const bottom = Math.min(vh, box.bottom + padY);
  const w = right - left;
  const h = bottom - top;
  if (w < 0.5 || h < 0.5) return;
  hits.push({
    pageIndex,
    x: left / vw,
    y: top / vh,
    w: w / vw,
    h: h / vh,
  });
}

/**
 * Find phrase matches as normalized top-left rects (0–1 of the displayed
 * pdf.js viewport). Boxes cover only the matched characters, not the whole run.
 */
export async function findTextRects(
  file: File,
  phrase: string,
): Promise<NormRect[]> {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return [];

  const transform = await getPdfTransform();
  const doc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  const hits: NormRect[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const vw = viewport.width;
    const vh = viewport.height;
    if (vw <= 0 || vh <= 0) continue;

    const content = await page.getTextContent();
    const styles = (content.styles || {}) as Record<
      string,
      { fontFamily?: string }
    >;

    let line: TextRun[] = [];
    let cursor = 0;
    let lineText = "";

    const flushLine = () => {
      if (!line.length) return;
      const lower = lineText.toLowerCase();
      let from = 0;
      while (from < lower.length) {
        const at = lower.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        let box: VpBox | null = null;
        for (const run of line) {
          const clipped = clipRunToMatch(run, at, end);
          if (!clipped) continue;
          box = box ? mergeVpBoxes(box, clipped) : clipped;
        }
        if (box) pushHit(hits, i - 1, box, vw, vh);
        from = end;
      }
      line = [];
      lineText = "";
      cursor = 0;
    };

    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      if (!raw.str) {
        if (raw.hasEOL) flushLine();
        continue;
      }

      const tx = transform(viewport.transform, raw.transform);
      const fontH = Math.hypot(tx[2], tx[3]) || raw.height || 10;
      const runWidth = Math.max(
        raw.width || fontH * raw.str.length * 0.45,
        fontH * 0.25,
      );
      // Match TextLayer: baseline at tx[5], top ≈ baseline − ascent
      const ascent = fontH * 0.8;
      const left = tx[4];
      const top = tx[5] - ascent;
      const bottom = top + fontH;

      const fontName =
        "fontName" in raw && raw.fontName ? String(raw.fontName) : "";
      const fontFamily = styles[fontName]?.fontFamily || "sans-serif";

      if (line.length) {
        const prev = line[line.length - 1];
        if (Math.abs(top - prev.top) >= Math.max(8, fontH * 0.65)) {
          flushLine();
        }
      }

      if (line.length && lineText.length) {
        // Synthetic space for wide gaps (no geometry; skipped when clipping)
        const prev = line[line.length - 1];
        const gap = left - prev.right;
        if (
          gap > fontH * 0.35 &&
          !lineText.endsWith(" ") &&
          !/^\s/.test(raw.str)
        ) {
          lineText += " ";
          cursor += 1;
        }
      }

      const start = cursor;
      lineText += raw.str;
      cursor += raw.str.length;
      line.push({
        left,
        top,
        right: left + runWidth,
        bottom,
        text: raw.str,
        start,
        end: cursor,
        fontSize: fontH,
        fontFamily,
      });

      if (raw.hasEOL) flushLine();
    }
    flushLine();
  }

  doc.cleanup();
  return hits;
}

/** Clickable text run for interactive redaction (normalized top-left 0–1). */
export type SelectableText = {
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function vpBoxToNorm(
  box: VpBox,
  pageIndex: number,
  id: string,
  vw: number,
  vh: number,
): SelectableText | null {
  const pad = 1.5;
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const right = Math.min(vw, box.right + pad);
  const bottom = Math.min(vh, box.bottom + pad);
  const w = right - left;
  const h = bottom - top;
  const text = box.text.replace(/\s+/g, " ").trim();
  if (!text || w < 0.5 || h < 0.5) return null;
  return {
    id,
    pageIndex,
    text,
    x: left / vw,
    y: top / vh,
    w: w / vw,
    h: h / vh,
  };
}

/**
 * Extract accurate text boxes via pdf.js viewport transforms.
 * Emits glyph/run boxes plus merged word and line targets so titles and
 * phrases are easy to click.
 */
export async function extractSelectableTexts(
  file: File,
): Promise<SelectableText[]> {
  const transform = await getPdfTransform();
  const doc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  const out: SelectableText[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const vw = viewport.width;
    const vh = viewport.height;
    if (vw <= 0 || vh <= 0) continue;

    const content = await page.getTextContent();
    const runs: VpBox[] = [];

    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str || !raw.str.trim()) continue;
      // Map PDF text matrix → viewport pixels (top-left CSS space)
      const tx = transform(viewport.transform, raw.transform);
      const fontH = Math.hypot(tx[2], tx[3]) || raw.height || 10;
      const width = Math.max(
        raw.width || fontH * raw.str.length * 0.5,
        fontH * 0.25,
      );
      const height = Math.max(raw.height || 0, fontH * 0.9, 4);
      const left = tx[4];
      const top = tx[5] - height;
      runs.push({
        left,
        top,
        right: left + width,
        bottom: top + height,
        text: raw.str,
      });
    }

    // Sort reading order (top→bottom, left→right)
    runs.sort((a, b) => a.top - b.top || a.left - b.left);

    // Merge glyph runs into words (split on whitespace / large gaps)
    const words: VpBox[] = [];
    let word: VpBox | null = null;
    for (const r of runs) {
      if (!r.text.trim()) {
        word = null;
        continue;
      }
      const gap = word ? r.left - word.right : 0;
      const sameLine =
        !!word &&
        Math.abs(r.top - word.top) < Math.max(8, (r.bottom - r.top) * 0.65);
      if (word && sameLine && gap < Math.max(6, (r.bottom - r.top) * 0.55)) {
        word = mergeVpBoxes(word, r);
        words[words.length - 1] = word;
      } else {
        word = { ...r };
        words.push(word);
      }
    }

    // Words — primary click targets
    words.forEach((w, wi) => {
      const n = vpBoxToNorm(w, i - 1, `w-${i - 1}-${wi}`, vw, vh);
      if (n) out.push(n);
    });

    // Lines — one-click titles / full phrases (under words in z-order)
    const lines: VpBox[] = [];
    let line: VpBox | null = null;
    for (const w of words) {
      const sameLine =
        !!line &&
        Math.abs(w.top - line.top) < Math.max(8, (w.bottom - w.top) * 0.65);
      if (line && sameLine) {
        const joined = mergeVpBoxes(line, { ...w, text: ` ${w.text}` });
        line = joined;
        lines[lines.length - 1] = joined;
      } else {
        line = { ...w };
        lines.push(line);
      }
    }
    lines.forEach((l, li) => {
      if (l.text.trim().split(/\s+/).length < 2) return;
      const n = vpBoxToNorm(l, i - 1, `l-${i - 1}-${li}`, vw, vh);
      if (n) out.push(n);
    });
  }

  doc.cleanup();
  // Prefer larger targets when drawing hit-tests: keep all, UI z-orders words above lines
  return out.filter((t) => t.w > 0.001 && t.h > 0.001);
}
