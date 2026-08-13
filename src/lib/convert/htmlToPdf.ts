import {
  flowingElementToA4Pdf,
  mountHtmlDocument,
  waitForLayout,
} from "./domToPdf";
import {
  ensureOfficeFontFallbacks,
  injectOfficeFontsIntoDocument,
} from "./officeFonts";

export async function htmlFileToPdf(file: File): Promise<Uint8Array> {
  const html = await file.text();
  return htmlStringToPdf(html);
}

/** Render an HTML string (already includes document chrome) to A4 PDF. */
export async function htmlStringToPdf(html: string): Promise<Uint8Array> {
  await ensureOfficeFontFallbacks();

  // A4 @ 96dpi ≈ 794px wide — matches printable page proportions
  const { host, root } = mountHtmlDocument(html, 794);
  try {
    await waitForLayout(root, 400);
    await ensureOfficeFontFallbacks();
    return await flowingElementToA4Pdf(root, {
      scale: 2.5,
      widthPx: 794,
      marginPt: 28,
      onClone: (doc) => injectOfficeFontsIntoDocument(doc),
    });
  } finally {
    host.remove();
  }
}
