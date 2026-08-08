import ExcelJS from "exceljs";
import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
} from "@/lib/pdf";

type RGB = ReturnType<typeof rgb>;

/** Compact workbook snapshot embedded in PDF for lossless Excel round-trip. */
export type WorkbookSnapshot = {
  v: 1;
  sheets: SnapshotSheet[];
};

export type SnapshotSheet = {
  name: string;
  cols: number[];
  merges: string[];
  rows: SnapshotRow[];
};

export type SnapshotRow = {
  h?: number;
  cells: SnapshotCell[];
};

export type SnapshotCell = {
  t: string;
  /** Fill ARGB e.g. FF4285F4 */
  f?: string;
  /** Font color ARGB */
  c?: string;
  b?: 1;
  i?: 1;
  s?: number;
  fn?: string;
  a?: "l" | "c" | "r";
  w?: 1;
};

const SCHEME = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;

const SNAPSHOT_FILENAME = "localfold-workbook.json";

function pdfSafeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, "-").trim() || "Sheet";
  base = base.slice(0, 31);
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

/** Parse theme XML → RRGGBB per scheme index. */
export function parseThemeColors(themeXml: string): string[] {
  const colors: string[] = [];
  for (const name of SCHEME) {
    const block = themeXml.match(
      new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`, "i"),
    );
    if (!block) {
      colors.push(name.startsWith("lt") ? "FFFFFF" : "000000");
      continue;
    }
    const srgb = block[1].match(/srgbClr[^>]*val="([A-Fa-f0-9]{6})"/i);
    const sys = block[1].match(/sysClr[^>]*lastClr="([A-Fa-f0-9]{6})"/i);
    colors.push((srgb?.[1] || sys?.[1] || "000000").toUpperCase());
  }
  return colors;
}

function applyTint(rrggbb: string, tint: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const parts = [0, 2, 4].map((i) => parseInt(rrggbb.slice(i, i + 2), 16));
  const out = parts.map((ch) => {
    if (tint < 0) return clamp(ch * (1 + tint));
    return clamp(ch * (1 - tint) + 255 * tint);
  });
  return out.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

type ColorInput = {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
};

export function resolveArgb(
  color: ColorInput | undefined,
  themeColors: string[],
): string | undefined {
  if (!color) return undefined;
  if (color.argb && /^[A-Fa-f0-9]{6,8}$/.test(color.argb)) {
    const a = color.argb.toUpperCase();
    return a.length === 6 ? `FF${a}` : a;
  }
  if (typeof color.theme === "number" && themeColors[color.theme]) {
    let rrggbb = themeColors[color.theme];
    if (typeof color.tint === "number" && color.tint !== 0) {
      rrggbb = applyTint(rrggbb, color.tint);
    }
    return `FF${rrggbb}`;
  }
  return undefined;
}

function argbToRgb(argb: string): RGB {
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function isLight(argb: string): boolean {
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (v instanceof Date) return v.toLocaleDateString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v && v.result != null) return String(v.result);
    if ("formula" in v && "result" in v) return String(v.result ?? "");
  }
  try {
    return cell.text || "";
  } catch {
    return "";
  }
}

function wrapPdfText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!cleaned) return [""];
  const paragraphs = cleaned.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(pdfSafeText(test), size) <= maxWidth) {
        cur = test;
        continue;
      }
      if (cur) lines.push(cur);
      if (font.widthOfTextAtSize(pdfSafeText(word), size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          const next = chunk + ch;
          if (
            font.widthOfTextAtSize(pdfSafeText(next), size) > maxWidth &&
            chunk
          ) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = next;
          }
        }
        cur = chunk;
      } else {
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [""];
}

function getFillArgb(
  cell: ExcelJS.Cell,
  themeColors: string[],
): string | undefined {
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern") return undefined;
  if (fill.pattern === "none") return undefined;
  const fg = fill.fgColor as ColorInput | undefined;
  // ExcelJS sometimes stores theme color directly on fill
  const direct = fill as unknown as { fgColor?: ColorInput } & ColorInput;
  return (
    resolveArgb(fg, themeColors) ||
    resolveArgb(direct.fgColor, themeColors) ||
    (typeof (fill as { fgColor?: { theme?: number } }).fgColor?.theme ===
    "number"
      ? resolveArgb(fill.fgColor as ColorInput, themeColors)
      : undefined) ||
    // theme shorthand: { theme: 4 } at fgColor level already handled
    resolveArgb(fill.fgColor as ColorInput, themeColors)
  );
}

/** ExcelJS may expose theme-only fills as `{ theme: N }` on fgColor. */
function readCellFill(cell: ExcelJS.Cell, themeColors: string[]): string | undefined {
  const fill = cell.fill as
    | ExcelJS.Fill
    | { fgColor?: ColorInput; theme?: number }
    | undefined;
  if (!fill) return undefined;

  // pattern none
  if ("type" in fill && fill.type === "pattern" && fill.pattern === "none") {
    return undefined;
  }

  if ("fgColor" in fill && fill.fgColor) {
    const argb = resolveArgb(fill.fgColor as ColorInput, themeColors);
    if (argb) return argb;
  }

  // Some cells: fill = { theme: 4 } (seen in dumps)
  if ("theme" in fill && typeof (fill as ColorInput).theme === "number") {
    return resolveArgb(fill as ColorInput, themeColors);
  }

  return getFillArgb(cell, themeColors);
}

function buildSnapshot(
  wb: ExcelJS.Workbook,
  themeColors: string[],
): WorkbookSnapshot {
  const sheets: SnapshotSheet[] = [];

  for (const ws of wb.worksheets) {
    if (!ws || ws.state === "hidden" || ws.state === "veryHidden") continue;

    const dim = ws.dimensions;
    if (!dim) {
      sheets.push({ name: ws.name, cols: [], merges: [], rows: [] });
      continue;
    }

    const minR = dim.top;
    const maxR = Math.min(dim.bottom, dim.top + 299);
    const minC = dim.left;
    const maxC = Math.min(dim.right, dim.left + 39);
    const colCount = maxC - minC + 1;

    const cols = Array.from({ length: colCount }, (_, i) => {
      const w = ws.getColumn(minC + i).width;
      return typeof w === "number" && w > 0 ? w : 12;
    });

    const merges = [...(ws.model.merges || [])];
    const mergeMasters = new Set(
      merges.map((m) => m.split(":")[0]?.toUpperCase()),
    );
    const mergeCovered = new Set<string>();
    for (const m of merges) {
      const [a, b] = m.split(":");
      if (!a || !b) continue;
      const start = ws.getCell(a);
      const end = ws.getCell(b);
      for (let r = start.row; r <= end.row; r += 1) {
        for (let c = start.col; c <= end.col; c += 1) {
          const addr = ws.getCell(r, c).address.toUpperCase();
          if (addr !== a.toUpperCase()) mergeCovered.add(addr);
        }
      }
    }

    const rows: SnapshotRow[] = [];
    for (let r = minR; r <= maxR; r += 1) {
      const row = ws.getRow(r);
      const cells: SnapshotCell[] = [];
      for (let c = minC; c <= maxC; c += 1) {
        const cell = ws.getCell(r, c);
        const addr = cell.address.toUpperCase();
        if (mergeCovered.has(addr) && !mergeMasters.has(addr)) {
          cells.push({ t: "" });
          continue;
        }

        const text = cellText(cell);
        const fill = readCellFill(cell, themeColors);
        const font = cell.font || {};
        // Sheets often marks header text as theme lt1 (white). On empty/light
        // fills that same theme index should render as black body text.
        let fontColor =
          resolveArgb(font.color as ColorInput, themeColors) || "FF000000";
        if (
          (fontColor === "FFFFFFFF" || fontColor === "FFFFFF") &&
          (!fill || isLight(fill))
        ) {
          fontColor = "FF000000";
        }
        const align =
          cell.alignment?.horizontal === "center"
            ? "c"
            : cell.alignment?.horizontal === "right"
              ? "r"
              : "l";

        const snap: SnapshotCell = { t: text };
        if (fill && fill.toUpperCase() !== "FFFFFFFF") snap.f = fill.toUpperCase();
        if (fontColor && fontColor.toUpperCase() !== "FF000000") {
          snap.c = fontColor.toUpperCase();
        }
        if (font.bold) snap.b = 1;
        if (font.italic) snap.i = 1;
        if (font.size) snap.s = font.size;
        if (font.name) snap.fn = font.name;
        if (align !== "l") snap.a = align;
        if (cell.alignment?.wrapText) snap.w = 1;
        cells.push(snap);
      }
      const h = row.height;
      rows.push(typeof h === "number" && h > 0 ? { h, cells } : { cells });
    }

    sheets.push({ name: ws.name, cols, merges, rows });
  }

  return { v: 1, sheets };
}

async function embedSnapshot(pdf: PDFDocument, snapshot: WorkbookSnapshot) {
  const json = JSON.stringify(snapshot);
  const data = new TextEncoder().encode(json);
  await pdf.attach(data, SNAPSHOT_FILENAME, {
    mimeType: "application/json",
    description: "LocalFold workbook snapshot (colors, sheet names, styles)",
    creationDate: new Date(),
    modificationDate: new Date(),
  });
}

export async function loadWorkbookSnapshot(
  pdfBytes: Uint8Array,
): Promise<WorkbookSnapshot | null> {
  try {
    const pdf = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const attachments = pdf.getAttachments() as {
      name?: string;
      data?: Uint8Array;
    }[];
    const hit = attachments?.find((a) =>
      (a.name || "").toLowerCase().includes("localfold-workbook"),
    );
    if (!hit?.data?.byteLength) return null;
    const text = new TextDecoder().decode(hit.data);
    const parsed = JSON.parse(text) as WorkbookSnapshot;
    if (parsed?.v !== 1 || !Array.isArray(parsed.sheets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function snapshotToXlsxBlob(
  snapshot: WorkbookSnapshot,
  title: string,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LocalFold";
  wb.title = title;
  const used = new Set<string>();

  for (const sheet of snapshot.sheets) {
    const name = sanitizeSheetName(sheet.name, used);
    const ws = wb.addWorksheet(name);

    sheet.cols.forEach((w, i) => {
      ws.getColumn(i + 1).width = Math.min(60, Math.max(6, w));
    });

    sheet.rows.forEach((row, ri) => {
      const excelRow = ws.getRow(ri + 1);
      if (row.h) excelRow.height = row.h;
      row.cells.forEach((cell, ci) => {
        const target = excelRow.getCell(ci + 1);
        if (cell.t) {
          const num = Number(cell.t);
          target.value =
            cell.t.trim() !== "" && Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(cell.t.trim())
              ? num
              : cell.t;
        }
        if (cell.f) {
          target.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: cell.f },
          };
        }
        target.font = {
          name: cell.fn || "Arial",
          bold: !!cell.b,
          italic: !!cell.i,
          size: cell.s || 10,
          color: cell.c ? { argb: cell.c } : { argb: "FF000000" },
        };
        target.alignment = {
          horizontal:
            cell.a === "c" ? "center" : cell.a === "r" ? "right" : "left",
          vertical: "middle",
          wrapText: !!cell.w || cell.t.includes("\n") || cell.t.length > 40,
        };
        target.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      });
      excelRow.commit();
    });

    for (const m of sheet.merges) {
      try {
        ws.mergeCells(m);
      } catch {
        /* ignore invalid */
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buf as ArrayBuffer);
  return new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)],
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  );
}

/**
 * Excel → PDF with original fills/fonts/merges/sheet names (selectable text),
 * plus an embedded snapshot for lossless PDF → Excel round-trip.
 */
export async function excelToPdf(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<Uint8Array> {
  onProgress?.("Reading spreadsheet styles…");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  if (!wb.worksheets.length) throw new Error("Spreadsheet is empty.");

  const themeXml =
    (wb as unknown as { _themes?: { theme1?: string } })._themes?.theme1 || "";
  const themeColors = themeXml
    ? parseThemeColors(themeXml)
    : [
        "000000",
        "FFFFFF",
        "000000",
        "FFFFFF",
        "4285F4",
        "EA4335",
        "FBBC04",
        "34A853",
        "FF6D01",
        "46BDC6",
        "0000FF",
        "800080",
      ];

  const snapshot = buildSnapshot(wb, themeColors);

  const pdf = await PDFDocument.create();
  pdf.setProducer("LocalFold (local-only)");
  pdf.setCreator("LocalFold");
  pdf.setTitle(file.name.replace(/\.(xlsx|xls)$/i, "") || "Spreadsheet");
  await embedSnapshot(pdf, snapshot);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = PageSizes.A4[1];
  const pageH = PageSizes.A4[0];
  const margin = 28;
  const padX = 4;
  const padY = 3;
  const usableW = pageW - margin * 2;

  let drew = false;

  for (let si = 0; si < snapshot.sheets.length; si += 1) {
    const sheet = snapshot.sheets[si];
    onProgress?.(
      `Rendering “${sheet.name}” (${si + 1}/${snapshot.sheets.length})…`,
    );

    if (!sheet.rows.length) {
      const page = pdf.addPage([pageW, pageH]);
      page.drawText(pdfSafeText(sheet.name).slice(0, 80), {
        x: margin,
        y: pageH - margin - 12,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText("(empty sheet)", {
        x: margin,
        y: pageH - margin - 32,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      drew = true;
      continue;
    }

    const colCount = Math.max(
      1,
      ...sheet.rows.map((r) => r.cells.length),
      sheet.cols.length,
    );
    const weights = Array.from({ length: colCount }, (_, c) =>
      Math.max(4, sheet.cols[c] || 12),
    );
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const colWidths = weights.map((w) => (w / weightSum) * usableW);

    // Pre-wrap rows with per-cell fonts
    type Wrapped = { lines: string[]; cell: SnapshotCell; size: number; bold: boolean };
    const wrappedRows: Wrapped[][] = sheet.rows.map((row) =>
      Array.from({ length: colCount }, (_, c) => {
        const cell = row.cells[c] || { t: "" };
        const bold = !!cell.b;
        const size = Math.min(14, Math.max(8, cell.s || 10));
        const f = bold ? fontBold : font;
        const lines = wrapPdfText(
          cell.t || "",
          f,
          size,
          Math.max(10, colWidths[c] - padX * 2),
        );
        return { lines, cell, size, bold };
      }),
    );

    // Merge map for drawing (skip covered, widen masters)
    const mergeBoxes = new Map<
      string,
      { r0: number; c0: number; r1: number; c1: number }
    >();
    for (const m of sheet.merges) {
      const [a, b] = m.split(":");
      if (!a || !b) continue;
      // addresses relative to sheet — ExcelJS uses absolute A1
      const parse = (addr: string) => {
        const m2 = addr.match(/^([A-Z]+)(\d+)$/i);
        if (!m2) return null;
        let col = 0;
        for (const ch of m2[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
        return { r: parseInt(m2[2], 10), c: col };
      };
      const p0 = parse(a);
      const p1 = parse(b);
      if (!p0 || !p1) continue;
      // Convert to 0-based row index in our snapshot (rows start at dim.top)
      // Snapshot rows are sequential from used range — merges use absolute Excel coords.
      // Find offset from first snapshot row by reading original — store absolute in snapshot.
      mergeBoxes.set(a.toUpperCase(), {
        r0: p0.r,
        c0: p0.c,
        r1: p1.r,
        c1: p1.c,
      });
    }

    // Determine absolute start row/col from first non-empty — we stored rows in order
    // from dimensions.top. Re-read from worksheet for offset.
    const ws = wb.worksheets[si];
    const dim = ws?.dimensions;
    const rowOffset = dim?.top ?? 1;
    const colOffset = dim?.left ?? 1;

    let rowIndex = 0;
    let pageNum = 0;
    while (rowIndex < wrappedRows.length) {
      pageNum += 1;
      const page = pdf.addPage([pageW, pageH]);
      drew = true;

      let y = pageH - margin;
      const title = pageNum === 1 ? sheet.name : `${sheet.name} (cont.)`;
      page.drawText(pdfSafeText(title).slice(0, 90), {
        x: margin,
        y: y - 11,
        size: 11,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 18;

      const tableTop = y;
      const xPositions: number[] = [];
      let x = margin;
      for (let c = 0; c < colCount; c += 1) {
        xPositions.push(x);
        x += colWidths[c];
      }

      const pageRows: number[] = [];
      let yCursor = tableTop;
      while (rowIndex + pageRows.length < wrappedRows.length) {
        const ri = rowIndex + pageRows.length;
        const lineCount = Math.max(
          1,
          ...wrappedRows[ri].map((w) => w.lines.length),
        );
        const excelH = sheet.rows[ri]?.h;
        const rowH = Math.max(
          lineCount * (wrappedRows[ri][0]?.size || 10 + 2) + padY * 2,
          excelH ? excelH * 0.75 : 0,
        );
        if (pageRows.length > 0 && yCursor - rowH < margin) break;
        pageRows.push(ri);
        yCursor -= rowH;
      }
      if (!pageRows.length) pageRows.push(rowIndex);

      // Precompute row heights for this page
      const rowHeights = pageRows.map((ri) => {
        const lineCount = Math.max(
          1,
          ...wrappedRows[ri].map((w) => w.lines.length),
        );
        const size = Math.max(...wrappedRows[ri].map((w) => w.size), 9);
        const excelH = sheet.rows[ri]?.h;
        return Math.max(lineCount * (size + 2) + padY * 2, excelH ? excelH * 0.75 : 0);
      });

      yCursor = tableTop;
      for (let pi = 0; pi < pageRows.length; pi += 1) {
        const ri = pageRows[pi];
        const rowH = rowHeights[pi];
        const absRow = rowOffset + ri;

        for (let c = 0; c < colCount; c += 1) {
          const absCol = colOffset + c;
          const addr = colToLetter(absCol) + String(absRow);
          const covered = [...mergeBoxes.entries()].some(([master, box]) => {
            if (master === addr.toUpperCase()) return false;
            return (
              absRow >= box.r0 &&
              absRow <= box.r1 &&
              absCol >= box.c0 &&
              absCol <= box.c1
            );
          });
          if (covered) continue;

          const box = mergeBoxes.get(addr.toUpperCase());
          let spanCols = 1;
          if (box && box.r0 === absRow) {
            spanCols = box.c1 - box.c0 + 1;
          }

          const cellX = xPositions[c];
          const cellW = colWidths
            .slice(c, c + spanCols)
            .reduce((a, b) => a + b, 0);
          const wrapped = wrappedRows[ri][c];
          const fillArgb = wrapped.cell.f;
          const fontArgb = wrapped.cell.c || "FF000000";

          page.drawRectangle({
            x: cellX,
            y: yCursor - rowH,
            width: cellW,
            height: rowH,
            color: fillArgb ? argbToRgb(fillArgb) : rgb(1, 1, 1),
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.6,
          });

          const f = wrapped.bold ? fontBold : font;
          const size = wrapped.size;
          let textColor = argbToRgb(fontArgb);
          if (fontArgb === "FFFFFFFF" || fontArgb === "FFFFFF") {
            textColor = rgb(1, 1, 1);
          } else if (
            fillArgb &&
            !isLight(fillArgb) &&
            (fontArgb === "FF000000" || !wrapped.cell.c)
          ) {
            textColor = rgb(1, 1, 1);
          }

          let ty = yCursor - padY - size;
          const align = wrapped.cell.a || "l";
          for (const line of wrapped.lines) {
            const safe = pdfSafeText(line);
            if (safe) {
              let tx = cellX + padX;
              const tw = f.widthOfTextAtSize(safe, size);
              if (align === "c") tx = cellX + (cellW - tw) / 2;
              if (align === "r") tx = cellX + cellW - padX - tw;
              page.drawText(safe, {
                x: Math.max(cellX + 1, tx),
                y: ty,
                size,
                font: f,
                color: textColor,
                maxWidth: cellW - padX * 2,
              });
            }
            ty -= size + 2;
          }
        }

        yCursor -= rowH;
      }

      rowIndex += pageRows.length;
    }
  }

  if (!drew) throw new Error("Spreadsheet has no content to convert.");
  onProgress?.("Writing PDF…");
  return pdf.save({ useObjectStreams: true });
}

function colToLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
