export type PdfPageThumb = {
  id: string;
  sourceIndex: number;
  thumbUrl: string;
  /** Page size in PDF points (1/72") */
  widthPt: number;
  heightPt: number;
};

/** Normalized crop rect in page space (origin top-left, values 0–1). */
export type CropRectNorm = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const FULL_PAGE_CROP: CropRectNorm = { x: 0, y: 0, w: 1, h: 1 };

/** Starting selection — slightly inset so handles are obvious (iLovePDF-style). */
export const DEFAULT_CROP: CropRectNorm = {
  x: 0.06,
  y: 0.06,
  w: 0.88,
  h: 0.88,
};

export function clampCropRect(r: CropRectNorm, minSize = 0.05): CropRectNorm {
  let { x, y, w, h } = r;
  w = Math.max(minSize, Math.min(1, w));
  h = Math.max(minSize, Math.min(1, h));
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { x, y, w, h };
}

/** Interactive redaction mark (normalized top-left page coords). */
export type RedactMark = CropRectNorm & {
  id: string;
  pageIndex: number;
  label: string;
  source: "draw" | "search" | "text";
  textId?: string;
};

export type StudioStatus = "idle" | "loading" | "working" | "done" | "error";

/** 3×3 placement grid used by watermark / page numbers / edit stamp */
export type GridPos =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const GRID_POSITIONS: GridPos[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function gridAnchor(
  pos: GridPos,
  pageW: number,
  pageH: number,
  textW: number,
  textH: number,
  margin = 36,
): { x: number; y: number } {
  const col = pos.includes("left") ? 0 : pos.includes("right") ? 2 : 1;
  const row = pos.startsWith("top") ? 0 : pos.startsWith("bottom") ? 2 : 1;

  const x =
    col === 0
      ? margin
      : col === 2
        ? pageW - margin - textW
        : (pageW - textW) / 2;

  // PDF y is from bottom
  const y =
    row === 2
      ? margin
      : row === 0
        ? pageH - margin - textH
        : (pageH - textH) / 2;

  return { x: Math.max(margin / 2, x), y: Math.max(margin / 2, y) };
}

export function gridDotClass(pos: GridPos): string {
  const map: Record<GridPos, string> = {
    "top-left": "left-2 top-2",
    "top-center": "left-1/2 top-2 -translate-x-1/2",
    "top-right": "right-2 top-2",
    "middle-left": "left-2 top-1/2 -translate-y-1/2",
    "middle-center": "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "middle-right": "right-2 top-1/2 -translate-y-1/2",
    "bottom-left": "bottom-2 left-2",
    "bottom-center": "bottom-2 left-1/2 -translate-x-1/2",
    "bottom-right": "bottom-2 right-2",
  };
  return map[pos];
}
