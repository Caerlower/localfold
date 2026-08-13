import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
} from "docx";
import { buildDocxFromPageImages } from "./docxFromImages";
import {
  createOffscreenHost,
  elementsToPdf,
  flowingElementToA4Pdf,
  waitForLayout,
} from "./domToPdf";
import {
  bytesImageExt,
  canvasToBytes,
  extractPageLines,
  extractPdfText,
  loadPdfJs,
  renderPageToCanvas,
} from "./pdfjs";
import {
  excelToPdf,
  loadWorkbookSnapshot,
  snapshotToXlsxBlob,
} from "./excelPdf";
import { EXPORT_IMAGE_TYPE, EXPORT_SCALE, JPEG_QUALITY, SLIDE_SCALE } from "./quality";

export { excelToPdf };

export type FidelityMode = "visual" | "editable";

/** PDF → Word that keeps the look of the page (resumes, designed layouts). */
export async function pdfToWord(
  file: File,
  mode: FidelityMode = "visual",
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  if (mode === "editable") {
    return pdfToWordEditable(file, onProgress);
  }
  return pdfToWordVisual(file, onProgress);
}

async function pdfToWordVisual(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  onProgress?.("Opening PDF…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength < 5) throw new Error("File is empty.");
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== "%PDF-") {
    throw new Error("That file does not look like a PDF.");
  }

  const pdf = await loadPdfJs(bytes);
  if (!pdf.numPages) throw new Error("This PDF has no pages.");

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    onProgress?.(`Rendering page ${i} of ${pdf.numPages} at print quality…`);
    const { canvas, viewport, scale } = await renderPageToCanvas(
      pdf,
      i,
      EXPORT_SCALE,
    );
    // Lossless PNG at ~288 DPI — no JPEG banding on resume text
    const imageBytes = await canvasToBytes(
      canvas,
      EXPORT_IMAGE_TYPE,
      JPEG_QUALITY,
    );
    if (!imageBytes.byteLength) {
      throw new Error(`Failed to capture page ${i}.`);
    }
    pages.push({
      bytes: imageBytes,
      ext: bytesImageExt(EXPORT_IMAGE_TYPE, imageBytes),
      widthPt: viewport.width / scale,
      heightPt: viewport.height / scale,
    });
  }

  pdf.cleanup();
  onProgress?.("Packaging Word document…");
  const blob = await buildDocxFromPageImages(pages, file.name);
  if (blob.size < 1000) {
    throw new Error("Word export produced an empty file. Please try again.");
  }
  return blob;
}

/** Editable text reconstruction with approximate hierarchy from font sizes. */
async function pdfToWordEditable(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  onProgress?.("Extracting positioned text…");
  const pdf = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  const children: Paragraph[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const { lines, pageWidth } = await extractPageLines(page);
    if (i > 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const sizes = lines.map((l) => l.fontSize).filter((s) => s > 0);
    const median =
      sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] || 11;

    for (const line of lines) {
      if (!line.text.trim()) continue;
      const isHeading = line.fontSize >= median * 1.35;
      const indentTwips = Math.max(0, Math.round((line.x / pageWidth) * 9000));
      children.push(
        new Paragraph({
          spacing: {
            after: isHeading ? 120 : 60,
            before: isHeading ? 160 : 0,
            line: 276,
          },
          indent: indentTwips > 200 ? { left: indentTwips } : undefined,
          children: [
            new TextRun({
              text: line.text,
              bold: isHeading,
              size: Math.round(
                Math.min(48, Math.max(16, line.fontSize * 1.7)),
              ), // half-points ≈
              font: "Calibri",
            }),
          ],
        }),
      );
    }
  }

  pdf.cleanup();
  const doc = new DocxDocument({
    creator: "LocalFold",
    title: file.name,
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

/** Word → PDF using OOXML layout (pages, styles, headers/footers, images). */
export async function wordToPdf(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Uint8Array> {
  const {
    DOCX_HOST_CSS,
    ensureOfficeFontFallbacks,
    injectOfficeFontsIntoDocument,
    reinforceElementFonts,
  } = await import("./officeFonts");

  onProgress?.("Loading document fonts…");
  await ensureOfficeFontFallbacks();

  onProgress?.("Rendering Word layout…");
  const { renderAsync } = await import("docx-preview");
  const host = createOffscreenHost(920);
  host.className = "lf-docx-root";

  // Keep styles in a dedicated bucket (docx-preview clears styleContainer).
  // They're still in document.styleSheets for layout; we also copy them into
  // the html2canvas clone via onClone.
  const styleHost = document.createElement("div");
  styleHost.setAttribute("data-lf-docx-styles", "1");
  styleHost.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;";
  document.body.appendChild(styleHost);

  const bodyHost = document.createElement("div");
  host.appendChild(bodyHost);

  const tidy = document.createElement("style");
  tidy.textContent = DOCX_HOST_CSS;
  styleHost.appendChild(tidy);

  try {
    await renderAsync(await file.arrayBuffer(), bodyHost, styleHost, {
      className: "docx",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderAltChunks: true,
    });

    // Re-assert theme font fallbacks after docx-preview's theme <style>
    const reinforce = document.createElement("style");
    reinforce.textContent = DOCX_HOST_CSS;
    styleHost.appendChild(reinforce);

    reinforceElementFonts(bodyHost);
    await waitForLayout(host, 900);
    await ensureOfficeFontFallbacks();

    // Make host measurable/capturable for html2canvas (near-zero opacity can
    // leave some engines with 0×0 boxes in headless Chromium).
    host.style.opacity = "1";
    host.style.zIndex = "-1";
    void host.offsetWidth;

    const onClone = (clonedDoc: globalThis.Document) => {
      injectOfficeFontsIntoDocument(clonedDoc);
      // Copy docx-preview + host CSS into the html2canvas iframe clone
      for (const node of Array.from(styleHost.querySelectorAll("style"))) {
        const clone = clonedDoc.createElement("style");
        clone.textContent = node.textContent;
        clonedDoc.head.appendChild(clone);
      }
    };

    const pages = Array.from(
      bodyHost.querySelectorAll<HTMLElement>("section.docx"),
    ).filter((el) => {
      const w = Math.max(el.offsetWidth, el.clientWidth, el.scrollWidth);
      const h = Math.max(el.offsetHeight, el.clientHeight, el.scrollHeight);
      return w > 40 && h > 40;
    });

    if (pages.length) {
      return await elementsToPdf(pages, {
        scale: 2.5,
        pageFormat: "uniform",
        normalizeBoxes: true,
        onProgress,
        onClone,
      });
    }

    // Continuous docs without explicit page sections
    onProgress?.("Capturing document…");
    const wrapper =
      bodyHost.querySelector<HTMLElement>(".docx-wrapper") || bodyHost;
    return await flowingElementToA4Pdf(wrapper, {
      scale: 2.5,
      widthPx: 816,
      onClone,
    });
  } finally {
    host.remove();
    styleHost.remove();
  }
}

/** True if canvas has no meaningful slide ink (blank / failed render). */
function canvasLooksEmpty(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 2 || canvas.height < 2) return true;

  // Sample several regions — content is often centered on title slides
  const regions = [
    [0, 0],
    [Math.floor(canvas.width * 0.4), Math.floor(canvas.height * 0.4)],
    [Math.floor(canvas.width * 0.7), Math.floor(canvas.height * 0.2)],
    [Math.floor(canvas.width * 0.1), Math.floor(canvas.height * 0.7)],
  ] as const;

  let ink = 0;
  let total = 0;
  for (const [sx, sy] of regions) {
    const w = Math.min(80, canvas.width - sx);
    const h = Math.min(45, canvas.height - sy);
    if (w < 1 || h < 1) continue;
    const { data } = ctx.getImageData(sx, sy, w, h);
    for (let i = 0; i < data.length; i += 4) {
      total += 1;
      const a = data[i + 3];
      if (a < 8) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Anything not near-white counts (includes dark theme slides)
      if (r < 245 || g < 245 || b < 245) ink += 1;
    }
  }
  return total === 0 || ink < total * 0.005;
}

/** Flatten slide onto opaque white — transparent PNGs look blank in many viewers. */
function flattenSlideCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = source.width;
  flat.height = source.height;
  const ctx = flat.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas unavailable in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(source, 0, 0);
  return flat;
}

/** PowerPoint → PDF: high-res slide images (keeps theme colors, shapes, layout). */
export async function powerpointToPdf(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Uint8Array> {
  onProgress?.("Loading presentation…");
  const { PptxRenderer } = await import("pptx-browser");
  const { registerOfficeFontsForPptx } = await import("./officeFonts");
  const { PDFDocument } = await import("@/lib/pdf");
  const renderer = new PptxRenderer();

  try {
    // Local Calibri/Cambria stand-ins before load so theme fonts resolve without
    // falling back to generic faces (or fetching Google Fonts).
    onProgress?.("Registering document fonts…");
    await registerOfficeFontsForPptx(renderer);

    await renderer.load(file, (_p: number, msg: string) => {
      if (msg) onProgress?.(msg);
    });
    if (!renderer.slideCount) {
      throw new Error("No slides found in this PPTX.");
    }

    const { cx, cy } = renderer.slideSize;
    if (!cx || !cy) {
      throw new Error("Could not read slide dimensions from this PPTX.");
    }

    // ~180 DPI — sharp enough for design fidelity, safer for large decks
    const widthPx = Math.min(
      1920,
      Math.max(1280, Math.round((cx / 914400) * 180)),
    );
    const pageW = (cx / 914400) * 72;
    const pageH = (cy / 914400) * 72;

    const pdf = await PDFDocument.create();
    pdf.setProducer("LocalFold (local-only)");
    pdf.setCreator("LocalFold");
    pdf.setTitle(file.name.replace(/\.pptx$/i, "") || "Presentation");

    let rendered = 0;

    for (let i = 0; i < renderer.slideCount; i += 1) {
      onProgress?.(
        `Rendering slide ${i + 1} of ${renderer.slideCount} (keeping design)…`,
      );

      // Let pptx-browser own canvas sizing (it resets width/height internally)
      const canvas = document.createElement("canvas");

      try {
        await renderer.renderSlide(i, canvas, widthPx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to render slide ${i + 1}: ${msg}`);
      }

      if (canvas.width < 2 || canvas.height < 2) {
        throw new Error(`Slide ${i + 1} rendered at invalid size.`);
      }

      const flat = flattenSlideCanvas(canvas);
      if (canvasLooksEmpty(flat)) {
        // Last resort: library JPEG exporter for this whole deck
        onProgress?.("Slide looks empty — trying alternate PDF exporter…");
        const fallback = await renderer.toPdf({
          width: widthPx,
          quality: 0.92,
          onProgress: (done, total) => {
            onProgress?.(`Alternate export: slide ${done} of ${total}…`);
          },
        });
        const bytes =
          fallback instanceof Uint8Array
            ? fallback
            : new Uint8Array(fallback as ArrayBuffer);
        if (bytes.byteLength < 1000) {
          throw new Error(
            "PowerPoint rendered blank. Try re-saving the PPTX in PowerPoint/Keynote and convert again.",
          );
        }
        return bytes;
      }

      // JPEG is more compatible than huge PNGs in some macOS Preview paths
      const jpeg = await canvasToBytes(flat, "image/jpeg", 0.93);
      const image = await pdf.embedJpg(new Uint8Array(jpeg));
      const page = pdf.addPage([pageW, pageH]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
      });
      rendered += 1;
    }

    if (!rendered) {
      throw new Error("No slides could be rendered from this PPTX.");
    }

    onProgress?.("Writing PDF…");
    // Object streams break a few viewers; keep the file simple
    return pdf.save({ useObjectStreams: false });
  } finally {
    try {
      renderer.destroy();
    } catch {
      /* ignore */
    }
  }
}

type ExcelCell = {
  x: number;
  text: string;
  bold: boolean;
  italic: boolean;
  fontSize: number;
  fontFamily: string;
};

type StyledGrid = {
  cells: (ExcelCell | null)[][];
  /** 1-based Excel row that should be treated as column headers (0 = none) */
  headerRow: number;
  /** Optional title above the table */
  title?: string;
};

/** Split a line’s glyphs into cells using real horizontal gaps. */
function cellsFromLineItems(
  items: {
    str: string;
    x: number;
    width: number;
    fontSize: number;
    bold?: boolean;
    italic?: boolean;
    fontFamily?: string;
  }[],
): ExcelCell[] {
  const parts = items.filter((it) => it.str.trim());
  if (!parts.length) return [];

  const cells: ExcelCell[] = [];
  let text = parts[0].str;
  let startX = parts[0].x;
  let bold = !!parts[0].bold;
  let italic = !!parts[0].italic;
  let fontSize = parts[0].fontSize;
  let fontFamily = parts[0].fontFamily || "Arial";

  for (let i = 1; i < parts.length; i += 1) {
    const prev = parts[i - 1];
    const cur = parts[i];
    const gap = cur.x - (prev.x + prev.width);
    const splitAt = Math.max(10, Math.min(prev.fontSize, cur.fontSize) * 1.05);
    if (gap > splitAt) {
      const trimmed = text.trim();
      if (trimmed) {
        cells.push({ x: startX, text: trimmed, bold, italic, fontSize, fontFamily });
      }
      text = cur.str;
      startX = cur.x;
      bold = !!cur.bold;
      italic = !!cur.italic;
      fontSize = cur.fontSize;
      fontFamily = cur.fontFamily || "Arial";
    } else {
      const spacer = gap > cur.fontSize * 0.18 ? " " : "";
      text += spacer + cur.str;
      bold = bold || !!cur.bold;
      italic = italic || !!cur.italic;
      fontSize = Math.max(fontSize, cur.fontSize);
    }
  }
  const trimmed = text.trim();
  if (trimmed) {
    cells.push({ x: startX, text: trimmed, bold, italic, fontSize, fontFamily });
  }
  return cells;
}

/** Cluster cell x-origins into stable column anchors. */
function clusterColumnXs(xs: number[], tol: number): number[] {
  if (!xs.length) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  const centers: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const x = sorted[i];
    const last = centers[centers.length - 1];
    if (x - last > tol) centers.push(x);
    else centers[centers.length - 1] = (last + x) / 2;
  }
  return centers;
}

function nearestColumn(x: number, columns: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < columns.length; i += 1) {
    const d = Math.abs(columns[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function pageLinesToStyledGrid(
  lines: Awaited<ReturnType<typeof extractPageLines>>["lines"],
): StyledGrid | null {
  const rowCells = lines
    .map((line) => cellsFromLineItems(line.items))
    .filter((cells) => cells.length > 0);
  if (!rowCells.length) return null;

  const maxCells = Math.max(...rowCells.map((r) => r.length));
  const avgFont =
    rowCells.reduce(
      (s, cells) =>
        s + cells.reduce((a, c) => a + c.fontSize, 0) / Math.max(cells.length, 1),
      0,
    ) / rowCells.length;

  let title: string | undefined;
  let start = 0;
  // Lone large/bold line above a multi-column table → sheet title
  if (
    maxCells >= 2 &&
    rowCells[0].length === 1 &&
    rowCells.length > 1 &&
    (rowCells[0][0].bold || rowCells[0][0].fontSize >= avgFont * 1.15)
  ) {
    title = rowCells[0][0].text;
    start = 1;
  }

  const body = rowCells.slice(start);
  if (!body.length) return null;

  const bodyMax = Math.max(...body.map((r) => r.length));
  let cells: (ExcelCell | null)[][];

  if (bodyMax >= 2) {
    const columns = clusterColumnXs(
      body.flatMap((r) => r.map((c) => c.x)),
      Math.max(14, avgFont * 1.6),
    );
    if (columns.length >= 2) {
      cells = body.map((row) => {
        const out: (ExcelCell | null)[] = Array.from(
          { length: columns.length },
          () => null,
        );
        for (const cell of row) {
          const col = nearestColumn(cell.x, columns);
          const prev = out[col];
          out[col] = prev
            ? {
                ...cell,
                text: `${prev.text} ${cell.text}`,
                bold: prev.bold || cell.bold,
                italic: prev.italic || cell.italic,
                fontSize: Math.max(prev.fontSize, cell.fontSize),
                fontFamily: prev.bold ? prev.fontFamily : cell.fontFamily,
              }
            : cell;
        }
        return out;
      });
    } else {
      cells = body.map((row) => row.map((c) => c));
    }
  } else {
    cells = body.map((row) => [
      {
        text: row.map((c) => c.text).join("  "),
        x: row[0].x,
        bold: row.some((c) => c.bold),
        italic: row.some((c) => c.italic),
        fontSize: Math.max(...row.map((c) => c.fontSize)),
        fontFamily: row.find((c) => c.bold)?.fontFamily || row[0].fontFamily,
      },
    ]);
  }

  // Header = first multi-col row that is mostly bold, else first row of a table
  let headerRow = 0;
  if (cells.length && (cells[0].filter(Boolean).length >= 2 || bodyMax >= 2)) {
    const first = cells[0].filter(Boolean) as ExcelCell[];
    const boldRatio =
      first.filter((c) => c.bold).length / Math.max(first.length, 1);
    headerRow = boldRatio >= 0.4 || bodyMax >= 2 ? 1 : 0;
  }

  return { cells, headerRow, title };
}

function plainGridToStyled(grid: string[][]): StyledGrid | null {
  if (!grid.length) return null;
  const cells = grid.map((row) =>
    row.map((text, i) =>
      text
        ? {
            text,
            x: i * 100,
            bold: false,
            italic: false,
            fontSize: 11,
            fontFamily: "Arial",
          }
        : null,
    ),
  );
  const colCount = Math.max(...grid.map((r) => r.length));
  return {
    cells,
    headerRow: colCount >= 2 ? 1 : 0,
  };
}

function parseExcelValue(text: string): string | number | boolean {
  const t = text.trim();
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    return Number(t.replace(/,/g, ""));
  }
  // Percent
  if (/^-?\d+(\.\d+)?%$/.test(t)) return Number(t.slice(0, -1)) / 100;
  return t;
}

async function styledGridsToXlsxBlob(
  sheets: { name: string; grid: StyledGrid }[],
  title: string,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "LocalFold";
  wb.created = new Date();
  wb.title = title;

  const thin = {
    style: "thin" as const,
    color: { argb: "FFC5CDD4" },
  };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  for (const { name, grid } of sheets) {
    const ws = wb.addWorksheet(name.slice(0, 31), {
      properties: { defaultRowHeight: 18 },
      views: grid.headerRow
        ? [{ state: "frozen", ySplit: grid.headerRow + (grid.title ? 1 : 0) }]
        : [],
    });

    let excelRow = 1;
    const colCount = Math.max(
      1,
      ...grid.cells.map((r) => r.length),
      grid.title ? 1 : 0,
    );

    // Prefer the dominant PDF font on this sheet for the title
    const sheetFont =
      grid.cells
        .flat()
        .find((c) => c?.fontFamily)?.fontFamily || "Arial";

    if (grid.title) {
      ws.mergeCells(1, 1, 1, colCount);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = grid.title;
      titleCell.font = {
        name: sheetFont,
        bold: true,
        size: 14,
        color: { argb: "FF1D6F42" },
      };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(1).height = 22;
      excelRow = 2;
    }

    for (let r = 0; r < grid.cells.length; r += 1) {
      const row = grid.cells[r];
      const isHeader = grid.headerRow === r + 1;
      const excelR = excelRow + r;
      const sheetRow = ws.getRow(excelR);

      for (let c = 0; c < colCount; c += 1) {
        const src = row[c];
        const cell = sheetRow.getCell(c + 1);
        const text = src?.text?.trim() ?? "";
        if (text) {
          const value = parseExcelValue(text);
          cell.value = value;
          if (typeof value === "number" && /%$/.test(text)) {
            cell.numFmt = "0.00%";
          } else if (typeof value === "number" && !Number.isInteger(value)) {
            cell.numFmt = "0.00";
          }
        }

        const pdfSize = src?.fontSize ?? 11;
        // Map PDF pt ≈ Excel size, clamp for readability
        const excelSize = Math.min(22, Math.max(9, Math.round(pdfSize)));
        const family = src?.fontFamily || sheetFont;
        cell.font = {
          name: family,
          bold: isHeader || !!src?.bold,
          italic: !!src?.italic,
          size: isHeader ? Math.max(excelSize, 11) : excelSize,
          color: { argb: isHeader ? "FF1D6F42" : "FF1A1A1A" },
        };
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal:
            typeof cell.value === "number" || typeof cell.value === "boolean"
              ? "right"
              : "left",
        };
        cell.border = border;

        if (isHeader) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8F5EE" },
          };
        } else if (r % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFAFBFC" },
          };
        }
      }
      sheetRow.commit();
    }

    // Column widths from content
    for (let c = 0; c < colCount; c += 1) {
      let maxLen = 8;
      if (grid.title && c === 0) maxLen = Math.max(maxLen, grid.title.length);
      for (const row of grid.cells) {
        maxLen = Math.max(maxLen, (row[c]?.text || "").length);
      }
      ws.getColumn(c + 1).width = Math.min(48, Math.max(10, maxLen + 2));
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buf as ArrayBuffer);
  if (bytes.byteLength < 50 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Excel export failed — please try another PDF.");
  }
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** OCR image-only PDF pages into row/column grids (best-effort). */
async function ocrPdfToGrids(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<string[][][]> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.("No text layer — running on-device OCR…");

  const worker = await createWorker("eng", 1, {
    workerPath: "/tessdata/worker.min.js",
    corePath: "/tessdata/core",
    langPath: "/tessdata",
    gzip: true,
  });

  try {
    const doc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
    const grids: string[][][] = [];

    for (let i = 1; i <= doc.numPages; i += 1) {
      onProgress?.(`OCR page ${i} of ${doc.numPages}…`);
      const { canvas } = await renderPageToCanvas(doc, i, 2.5);
      const {
        data: { text },
      } = await worker.recognize(canvas);

      const rows = (text || "")
        .split(/\n+/)
        .map((line) => line.replace(/\s+$/g, "").trim())
        .filter(Boolean)
        .map((line) => {
          // Split on 2+ spaces or pipes — common table OCR patterns
          const parts = line
            .split(/\s{2,}|\s*\|\s*/)
            .map((p) => p.trim())
            .filter(Boolean);
          return parts.length ? parts : [line];
        });
      if (rows.length) grids.push(rows);
    }
    doc.cleanup();
    return grids;
  } finally {
    await worker.terminate();
  }
}

function sanitizeExcelSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, "-").replace(/\s+\(cont\.\)$/i, "").trim();
  base = (base || "Sheet").slice(0, 31);
  let out = base;
  let n = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` (${n})`;
    out = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(out.toLowerCase());
  return out;
}

export async function pdfToExcel(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  onProgress?.("Opening PDF…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength < 5) throw new Error("File is empty.");
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== "%PDF-") {
    throw new Error("That file does not look like a PDF.");
  }

  // Lossless path: PDF produced by LocalFold Excel → PDF embeds a workbook snapshot
  onProgress?.("Checking for original spreadsheet data…");
  const snapshot = await loadWorkbookSnapshot(bytes);
  if (snapshot?.sheets?.length) {
    onProgress?.("Restoring original sheets, colors, and styles…");
    return snapshotToXlsxBlob(
      snapshot,
      file.name.replace(/\.pdf$/i, "") || "Extract",
    );
  }

  const pdf = await loadPdfJs(bytes);
  if (!pdf.numPages) throw new Error("This PDF has no pages.");

  const sheets: { name: string; grid: StyledGrid }[] = [];
  const usedNames = new Set<string>();

  for (let i = 1; i <= pdf.numPages; i += 1) {
    onProgress?.(`Extracting tables from page ${i} of ${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    const { lines } = await extractPageLines(page);
    const grid = pageLinesToStyledGrid(lines);
    if (!grid) continue;
    const filled = grid.cells.reduce(
      (n, row) => n + row.filter((c) => c?.text).length,
      0,
    );
    if (!filled) continue;

    const titleName = grid.title?.replace(/\s+\(cont\.\)$/i, "").trim();
    // Continuation pages of the same sheet → append rows instead of new tab
    if (titleName && /\(cont\.\)$/i.test(grid.title || "")) {
      const prev = sheets.find(
        (s) => s.name.toLowerCase() === titleName.toLowerCase().slice(0, 31),
      );
      if (prev) {
        prev.grid.cells.push(...grid.cells);
        continue;
      }
    }

    const name = sanitizeExcelSheetName(
      titleName || (pdf.numPages === 1 ? "Sheet1" : `Page ${i}`),
      usedNames,
    );
    // Don't duplicate title row inside the sheet when it became the tab name
    const gridForSheet = titleName ? { ...grid, title: undefined } : grid;
    sheets.push({ name, grid: gridForSheet });
  }
  pdf.cleanup();

  // Older LocalFold Excel→PDF exports (and scans) are image-only — OCR them
  if (!sheets.length) {
    const ocrGrids = await ocrPdfToGrids(file, onProgress);
    for (let i = 0; i < ocrGrids.length; i += 1) {
      const grid = plainGridToStyled(ocrGrids[i]);
      if (!grid) continue;
      sheets.push({
        name: sanitizeExcelSheetName(
          ocrGrids.length === 1 ? "Sheet1" : `Page ${i + 1}`,
          usedNames,
        ),
        grid,
      });
    }
  }

  if (!sheets.length) {
    throw new Error(
      "Could not read any text from this PDF (even with OCR). Try a clearer scan.",
    );
  }

  onProgress?.("Building styled spreadsheet…");
  return styledGridsToXlsxBlob(
    sheets,
    file.name.replace(/\.pdf$/i, "") || "Extract",
  );
}

/**
 * pptxgenjs 4.0.1 writes phantom slideMaster2..N Content_Types overrides
 * (only slideMaster1 exists). macOS Preview / PowerPoint "repair" then
 * remaps media and can make later slides look like repeats of earlier ones.
 */
async function sanitizePptxgenOutput(blob: Blob): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const masters = new Set(
    Object.keys(zip.files)
      .filter((p) => /^ppt\/slideMasters\/[^/]+\.xml$/i.test(p))
      .map((p) => p.split("/").pop()!),
  );

  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    ct = ct.replace(
      /<Override\s+PartName="\/ppt\/slideMasters\/([^"]+)"[^>]*\/>/g,
      (full, filename: string) => (masters.has(filename) ? full : ""),
    );
    zip.file("[Content_Types].xml", ct);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}

export async function pdfToPowerpoint(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.author = "LocalFold";
  pptx.title = file.name.replace(/\.pdf$/i, "") || "Presentation";

  const doc = await loadPdfJs(new Uint8Array(await file.arrayBuffer()));
  if (!doc.numPages) {
    throw new Error("This PDF has no pages.");
  }

  // One layout for the whole deck — changing layout per slide confuses some viewers
  const first = await renderPageToCanvas(doc, 1, SLIDE_SCALE);
  const wIn = 10;
  const hIn = (first.viewport.height / first.viewport.width) * wIn;
  pptx.defineLayout({ name: "PDF_PAGE", width: wIn, height: hIn });
  pptx.layout = "PDF_PAGE";

  for (let i = 1; i <= doc.numPages; i += 1) {
    onProgress?.(`Rendering slide ${i} of ${doc.numPages} at high quality…`);
    const { canvas, page } =
      i === 1 ? first : await renderPageToCanvas(doc, i, SLIDE_SCALE);

    // Unique path prevents pptxgenjs media-dedupe from treating every
    // data-URL image as the same "preencoded.png" in edge cases.
    const data = canvas.toDataURL("image/png");
    const slide = pptx.addSlide();
    slide.addImage({
      data,
      path: `localfold-page-${i}.png`,
      x: 0,
      y: 0,
      w: wIn,
      h: hIn,
    });
    try {
      page.cleanup();
    } catch {
      /* ignore */
    }
  }
  doc.cleanup();

  onProgress?.("Writing PowerPoint…");
  const raw = (await pptx.write({ outputType: "blob" })) as Blob;
  return sanitizePptxgenOutput(raw);
}

export { extractPdfText };
