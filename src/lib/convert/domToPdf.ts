import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/** Off-screen host for layout engines that need a real DOM. */
export function createOffscreenHost(widthPx = 900): HTMLDivElement {
  const host = document.createElement("div");
  // Keep the host in-document at a real viewport origin. html2canvas clones via
  // an iframe and throws "Unable to find element in cloned iframe" when the
  // node is far off-screen (e.g. left:-10000px). Near-zero opacity hides it.
  // Explicit document font stack — never inherit LocalFold's UI font (Outfit).
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${widthPx}px`,
    "height:auto",
    "max-height:none",
    "overflow:visible",
    "opacity:0.01",
    "pointer-events:none",
    "z-index:-1",
    "background:#fff",
    'font-family:Calibri,Carlito,"Segoe UI",Arial,"Helvetica Neue",sans-serif',
    "font-size:11pt",
    "color:#111",
    "line-height:normal",
    "letter-spacing:normal",
    "-webkit-font-smoothing:antialiased",
  ].join(";");
  document.body.appendChild(host);
  return host;
}

export async function waitForLayout(root: ParentNode, ms = 400): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  const doc = root instanceof Document ? root : root.ownerDocument;
  if (doc?.fonts?.ready) {
    try {
      await Promise.race([
        doc.fonts.ready,
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* ignore */
    }
  }
  const el =
    root instanceof Element
      ? root
      : ((root as Document).body as HTMLElement | null);
  if (!el) return;
  const images = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
  await Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 2000);
            }),
    ),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Cap capture size so huge sheets don't freeze the tab. */
const MAX_CAPTURE_PX = 8000;

const PAGE_FORMATS = {
  a4: { w: 595.28, h: 841.89 },
  "a4-landscape": { w: 841.89, h: 595.28 },
  letter: { w: 612, h: 792 },
  "letter-landscape": { w: 792, h: 612 },
} as const;

export type PdfPageFormat = keyof typeof PAGE_FORMATS | "uniform";

export async function elementToCanvas(
  el: HTMLElement,
  scale = 2,
  opts?: {
    /** Called with the cloned document before rasterizing (e.g. inject @font-face). */
    onClone?: (doc: Document, cloned: HTMLElement) => void;
  },
): Promise<HTMLCanvasElement> {
  // Near-zero opacity on offscreen hosts can yield 0×0 boxes in headless Chrome.
  // Restore ancestors for the duration of the capture.
  const opacityRestores: { el: HTMLElement; prev: string }[] = [];
  let walk: HTMLElement | null = el;
  while (walk && walk !== document.body) {
    const op = walk.style.opacity;
    if (op && Number(op) < 0.05) {
      opacityRestores.push({ el: walk, prev: op });
      walk.style.opacity = "1";
    }
    walk = walk.parentElement;
  }

  // Force layout — some engines (docx-preview) leave 0×0 boxes until read
  void el.offsetWidth;
  const width = Math.min(
    MAX_CAPTURE_PX,
    Math.max(el.scrollWidth, el.offsetWidth, el.clientWidth, 1),
  );
  // +2px buffer avoids occasional 1px bottom clipping from subpixel layout
  const height = Math.min(
    MAX_CAPTURE_PX,
    Math.max(el.scrollHeight, el.offsetHeight, el.clientHeight, 1) + 2,
  );

  if (width < 2 || height < 2) {
    throw new Error("Page has no layout size to capture. Try another file.");
  }

  const maxDim = Math.max(width, height) * scale;
  const safeScale = maxDim > 9000 ? Math.max(1, (9000 / maxDim) * scale) : scale;

  const capture = () =>
    html2canvas(el, {
      scale: safeScale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      imageTimeout: 2000,
      logging: false,
      removeContainer: true,
      // Prefer foreignObject-free path — more reliable for Word/Excel DOM
      foreignObjectRendering: false,
      onclone: (doc, cloned) => {
        opts?.onClone?.(doc, cloned as HTMLElement);
      },
    });

  try {
    try {
      return await withTimeout(capture(), 45000, "Page capture");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Retry once with the node staged at the viewport origin (html2canvas clone bug)
      if (!/cloned iframe|Unable to find element/i.test(msg)) throw err;

      const staging = document.createElement("div");
      staging.style.cssText =
        "position:fixed;left:0;top:0;z-index:2147483646;opacity:1;pointer-events:none;background:#fff;";
      const parent = el.parentElement;
      const next = el.nextSibling;
      staging.appendChild(el);
      document.body.appendChild(staging);
      try {
        void el.offsetWidth;
        return await withTimeout(capture(), 45000, "Page capture");
      } finally {
        if (parent) parent.insertBefore(el, next);
        else staging.removeChild(el);
        staging.remove();
      }
    }
  } finally {
    for (const { el: node, prev } of opacityRestores) {
      node.style.opacity = prev;
    }
  }
}

export async function elementToPngDataUrl(
  el: HTMLElement,
  scale = 2,
): Promise<string> {
  const canvas = await elementToCanvas(el, scale);
  return canvas.toDataURL("image/png");
}

function resolvePageSize(
  pages: HTMLElement[],
  format: PdfPageFormat,
): { pageW: number; pageH: number } {
  if (format !== "uniform") {
    const { w, h } = PAGE_FORMATS[format];
    return { pageW: w, pageH: h };
  }
  const first = pages[0];
  const PX_TO_PT = 72 / 96;
  const pageW = Math.max(first.offsetWidth, first.clientWidth, 1) * PX_TO_PT;
  const pageH = Math.max(first.offsetHeight, first.clientHeight, 1) * PX_TO_PT;
  return {
    pageW: Math.max(pageW, 200),
    pageH: Math.max(pageH, 200),
  };
}

/** Normalize every page element to the first page’s CSS box before capture. */
function normalizePageBoxes(pages: HTMLElement[]): void {
  if (!pages.length) return;
  const first = pages[0];
  const w = Math.max(first.offsetWidth, first.clientWidth, 1);
  const h = Math.max(first.offsetHeight, first.clientHeight, 1);
  for (const p of pages) {
    p.style.boxSizing = "border-box";
    p.style.width = `${w}px`;
    p.style.height = `${h}px`;
    p.style.minWidth = `${w}px`;
    p.style.minHeight = `${h}px`;
    p.style.maxWidth = `${w}px`;
    p.style.overflow = "hidden";
    p.style.background = "#fff";
  }
}

/**
 * Slice a canvas onto fixed-size PDF pages. Uses source-rectangle cropping so
 * each page gets a clean band (no negative-Y full-image tricks).
 */
function addCanvasToFixedPages(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  pageW: number,
  pageH: number,
  isFirstPage: boolean,
  marginPt = 0,
): void {
  const printableW = Math.max(pageW - marginPt * 2, 1);
  const printableH = Math.max(pageH - marginPt * 2, 1);

  // Map canvas → printable width
  const pxPerPt = canvas.width / printableW;
  const pageBandPx = printableH * pxPerPt;
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageBandPx - 1e-6));

  let first = isFirstPage;
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    if (!first) {
      pdf.addPage([pageW, pageH], pageW >= pageH ? "l" : "p");
    }
    first = false;

    const srcY = Math.floor(pageIndex * pageBandPx);
    const srcH = Math.min(Math.ceil(pageBandPx), canvas.height - srcY);
    if (srcH <= 0) break;

    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = srcH;
    const ctx = slice.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0,
      srcY,
      canvas.width,
      srcH,
      0,
      0,
      canvas.width,
      srcH,
    );

    const sliceHpt = srcH / pxPerPt;
    const data = slice.toDataURL("image/png");
    pdf.addImage(
      data,
      "PNG",
      marginPt,
      marginPt,
      printableW,
      sliceHpt,
      undefined,
      "FAST",
    );
  }
}

/**
 * Build a PDF from discrete page elements. All PDF pages share one size.
 */
export async function elementsToPdf(
  pages: HTMLElement[],
  opts?: {
    scale?: number;
    onProgress?: (msg: string) => void;
    /** Default `uniform` = first page box for all. Use `a4-landscape` for sheets. */
    pageFormat?: PdfPageFormat;
    /** Force every DOM page to the same CSS size before capture (default true). */
    normalizeBoxes?: boolean;
    onClone?: (doc: Document, cloned: HTMLElement) => void;
  },
): Promise<Uint8Array> {
  if (!pages.length) throw new Error("Nothing to render.");
  const scale = opts?.scale ?? 2;
  const pageFormat = opts?.pageFormat ?? "uniform";

  if (opts?.normalizeBoxes !== false && pageFormat === "uniform") {
    normalizePageBoxes(pages);
    await new Promise((r) => setTimeout(r, 50));
  }

  if (pageFormat !== "uniform") {
    const targetW =
      pageFormat === "a4-landscape" || pageFormat === "letter-landscape"
        ? 1100
        : 794;
    for (const p of pages) {
      p.style.boxSizing = "border-box";
      p.style.width = `${targetW}px`;
      p.style.minWidth = `${targetW}px`;
      p.style.maxWidth = `${targetW}px`;
      p.style.background = "#fff";
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  const { pageW, pageH } = resolvePageSize(pages, pageFormat);
  const pdf = new jsPDF({
    orientation: pageW >= pageH ? "l" : "p",
    unit: "pt",
    format: [pageW, pageH],
    compress: true,
  });

  // Uniform Word pages already include margins; fixed paper gets a small margin
  // only when we paginate overflowing sheet captures.
  const margin =
    pageFormat === "a4" ||
    pageFormat === "a4-landscape" ||
    pageFormat === "letter" ||
    pageFormat === "letter-landscape"
      ? 24
      : 0;

  let firstPage = true;
  for (let i = 0; i < pages.length; i += 1) {
    opts?.onProgress?.(`Rendering page ${i + 1} of ${pages.length}…`);
    await new Promise((r) => setTimeout(r, 0));
    const canvas = await elementToCanvas(pages[i], scale, {
      onClone: opts?.onClone,
    });

    if (pageFormat === "uniform") {
      // One element = one full page (already page-sized)
      if (!firstPage) {
        pdf.addPage([pageW, pageH], pageW >= pageH ? "l" : "p");
      }
      firstPage = false;
      const data = canvas.toDataURL("image/png");
      pdf.addImage(data, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
    } else {
      addCanvasToFixedPages(pdf, canvas, pageW, pageH, firstPage, margin);
      firstPage = false;
    }
  }

  return new Uint8Array(pdf.output("arraybuffer"));
}

/**
 * Capture a tall flowing document into A4 pages.
 * Short docs that almost fit are scaled onto one page so text isn't sliced.
 */
export async function flowingElementToA4Pdf(
  target: HTMLElement,
  opts?: {
    scale?: number;
    widthPx?: number;
    marginPt?: number;
    onClone?: (doc: Document, cloned: HTMLElement) => void;
  },
): Promise<Uint8Array> {
  const scale = opts?.scale ?? 2;
  const widthPx = opts?.widthPx ?? 794;
  const marginPt = opts?.marginPt ?? 36;

  target.style.width = `${widthPx}px`;
  target.style.maxWidth = `${widthPx}px`;
  target.style.background = "#ffffff";
  // Ensure padding from rewritten body styles isn't collapsed away
  if (!target.style.boxSizing) target.style.boxSizing = "border-box";

  await new Promise((r) => setTimeout(r, 30));

  const canvas = await elementToCanvas(target, scale, {
    onClone: opts?.onClone,
  });

  const pageW = PAGE_FORMATS.a4.w;
  const pageH = PAGE_FORMATS.a4.h;
  const printableW = pageW - marginPt * 2;
  const printableH = pageH - marginPt * 2;

  const naturalH = (canvas.height * printableW) / Math.max(canvas.width, 1);
  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  // If content is within ~12% of one page, shrink slightly to keep one page
  // instead of cutting through the footer.
  if (naturalH <= printableH * 1.12) {
    const fitScale = Math.min(1, printableH / naturalH);
    const drawW = printableW * fitScale;
    const drawH = naturalH * fitScale;
    const x = marginPt + (printableW - drawW) / 2;
    const y = marginPt;
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      x,
      y,
      drawW,
      drawH,
      undefined,
      "FAST",
    );
    return new Uint8Array(pdf.output("arraybuffer"));
  }

  addCanvasToFixedPages(pdf, canvas, pageW, pageH, true, marginPt);
  return new Uint8Array(pdf.output("arraybuffer"));
}

/** Rewrite html/body selectors so document CSS applies to our mount root. */
function scopeDocumentStyles(css: string, scope: string): string {
  return css
    .replace(/(^|}|,)(\s*)body(\s*[{,:])/g, `$1$2${scope}$3`)
    .replace(/(^|}|,)(\s*)html(\s*[{,:])/g, `$1$2${scope}$3`);
}

/** Mount an HTML document string into the current page (no iframe). */
export function mountHtmlDocument(
  html: string,
  widthPx = 794,
): { host: HTMLDivElement; root: HTMLElement } {
  const host = createOffscreenHost(widthPx);
  const root = document.createElement("div");
  root.className = "lf-html-root";
  root.style.cssText = [
    `width:${widthPx}px`,
    "max-width:100%",
    "background:#fff",
    "color:#111",
    "box-sizing:border-box",
    "overflow:visible",
    // Document default — source CSS can override; never inherit site UI fonts
    'font-family:Calibri,Carlito,"Segoe UI",Arial,"Helvetica Neue",sans-serif',
    "font-size:11pt",
    "line-height:1.45",
    "letter-spacing:normal",
  ].join(";");

  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const style of Array.from(parsed.querySelectorAll("style"))) {
    const scoped = document.createElement("style");
    scoped.textContent = scopeDocumentStyles(
      style.textContent || "",
      ".lf-html-root",
    );
    root.appendChild(scoped);
  }
  // Prefer linked stylesheets that are already inline-only in our samples
  const body = parsed.body;
  while (body.firstChild) {
    root.appendChild(body.firstChild);
  }
  host.appendChild(root);
  return { host, root };
}
