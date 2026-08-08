/** Shared export quality — aim for print-sharp output, not preview thumbnails. */

/** 72 PDF points/inch → scale 4 ≈ 288 DPI (near print) */
export const EXPORT_SCALE = 4;

/** Slightly lighter for multi-page PPT / compare previews */
export const SLIDE_SCALE = 3.5;

/** On-screen compare only */
export const PREVIEW_SCALE = 1.5;

/** Prefer lossless PNG for visual fidelity exports */
export const EXPORT_IMAGE_TYPE = "image/png" as const;

/** If we must use JPEG (huge pages), keep it near-lossless */
export const JPEG_QUALITY = 0.98;
