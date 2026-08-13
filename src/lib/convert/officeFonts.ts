/**
 * Office-compatible font fallbacks for Word → PDF.
 *
 * Most .docx files name Calibri/Cambria/etc. but don't embed the files.
 * Without a substitute, CSS falls through to LocalFold's site font (Outfit).
 * We register metric-compatible Croscore faces (Carlito/Caladea) under the
 * Office family names, preferring a locally installed Office font when present.
 */

const STYLE_ID = "lf-office-font-fallbacks";
const FONT_BASE = "/fonts/office";

const FACE_RULES = `
@font-face {
  font-family: "Calibri";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Calibri"), local("Carlito"),
    url("${FONT_BASE}/Calibri-Regular.ttf") format("truetype");
}
@font-face {
  font-family: "Calibri";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local("Calibri Bold"), local("Carlito Bold"),
    url("${FONT_BASE}/Calibri-Bold.ttf") format("truetype");
}
@font-face {
  font-family: "Calibri";
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: local("Calibri Italic"), local("Carlito Italic"),
    url("${FONT_BASE}/Calibri-Italic.ttf") format("truetype");
}
@font-face {
  font-family: "Calibri";
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: local("Calibri Bold Italic"), local("Carlito Bold Italic"),
    url("${FONT_BASE}/Calibri-BoldItalic.ttf") format("truetype");
}
@font-face {
  font-family: "Cambria";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Cambria"), local("Caladea"),
    url("${FONT_BASE}/Cambria-Regular.ttf") format("truetype");
}
@font-face {
  font-family: "Cambria";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local("Cambria Bold"), local("Caladea Bold"),
    url("${FONT_BASE}/Cambria-Bold.ttf") format("truetype");
}
@font-face {
  font-family: "Cambria";
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: local("Cambria Italic"), local("Caladea Italic"),
    url("${FONT_BASE}/Cambria-Italic.ttf") format("truetype");
}
@font-face {
  font-family: "Cambria";
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: local("Cambria Bold Italic"), local("Caladea Bold Italic"),
    url("${FONT_BASE}/Cambria-BoldItalic.ttf") format("truetype");
}
@font-face {
  font-family: "Arial";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Arial"), local("Helvetica Neue"), local("Helvetica");
}
@font-face {
  font-family: "Arial";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local("Arial Bold"), local("Helvetica Neue Bold"), local("Helvetica Bold");
}
@font-face {
  font-family: "Times New Roman";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Times New Roman"), local("Times"), local("Liberation Serif"), serif;
}
@font-face {
  font-family: "Times New Roman";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local("Times New Roman Bold"), local("Liberation Serif Bold");
}
@font-face {
  font-family: "Georgia";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Georgia"), local("Palatino Linotype"), local("Book Antiqua"), serif;
}
@font-face {
  font-family: "Courier New";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Courier New"), local("Courier"), local("Liberation Mono"), monospace;
}
`;

/** Isolate the Word render tree from the site UI font and reinforce theme vars. */
export const DOCX_HOST_CSS = `
.lf-docx-root {
  font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif !important;
  font-size: 11pt;
  color: #111;
  line-height: normal;
  letter-spacing: normal;
  word-spacing: normal;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}
.lf-docx-root .docx-wrapper {
  background: #fff !important;
  padding: 0 !important;
  font-family: inherit;
}
.lf-docx-root .docx-wrapper > section.docx {
  box-shadow: none !important;
  margin: 0 auto !important;
  background: #fff !important;
  /* docx-preview theme vars are bare names — give them real fallback stacks */
  --docx-majorHAnsi-font: Calibri, Carlito, "Segoe UI", Arial, sans-serif;
  --docx-minorHAnsi-font: Calibri, Carlito, "Segoe UI", Arial, sans-serif;
  --docx-majorEastAsia-font: "Segoe UI", Arial, sans-serif;
  --docx-minorEastAsia-font: "Segoe UI", Arial, sans-serif;
  --docx-majorBidi-font: Arial, sans-serif;
  --docx-minorBidi-font: Arial, sans-serif;
}
`;

let fontsReady: Promise<void> | null = null;

function injectFaceStyle(): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = FACE_RULES;
    document.head.appendChild(style);
  }
  return style;
}

/** Load Calibri/Cambria stand-ins and wait for document.fonts. */
export async function ensureOfficeFontFallbacks(): Promise<void> {
  if (typeof document === "undefined") return;
  injectFaceStyle();

  if (!fontsReady) {
    fontsReady = (async () => {
      const faces = [
        "400 12px Calibri",
        "700 12px Calibri",
        "italic 400 12px Calibri",
        "italic 700 12px Calibri",
        "400 12px Cambria",
        "700 12px Cambria",
        "italic 400 12px Cambria",
        "400 12px Arial",
        "400 12px 'Times New Roman'",
      ];
      try {
        await Promise.race([
          Promise.all(
            faces.map((f) => document.fonts.load(f).catch(() => undefined)),
          ),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      } catch {
        /* fonts still usable via local() / generic fallbacks */
      }
    })();
  }

  await fontsReady;
}

/**
 * Append generic fallbacks to bare inline font-family values so a missing
 * face never inherits Outfit from <body>.
 */
export function reinforceElementFonts(root: HTMLElement): void {
  const nodes = [
    root,
    ...Array.from(root.querySelectorAll<HTMLElement>("*")),
  ];
  for (const el of nodes) {
    const inline = el.style.fontFamily?.trim();
    if (!inline) continue;
    const lower = inline.toLowerCase();
    if (
      lower.includes("sans-serif") ||
      lower.includes("serif") ||
      lower.includes("monospace") ||
      lower.includes("carlito")
    ) {
      continue;
    }
    el.style.fontFamily = `${inline}, Carlito, "Segoe UI", Arial, sans-serif`;
  }
}

/** Ensure @font-face rules exist inside an html2canvas clone document. */
export function injectOfficeFontsIntoDocument(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FACE_RULES;
  doc.head.appendChild(style);
}

type PptxFontRegistrar = {
  registerFont: (
    family: string,
    source: string,
    descriptors?: { weight?: string; style?: string },
  ) => Promise<unknown>;
};

/** Point pptx-browser at local Calibri/Cambria stand-ins (no Google Fonts fetch). */
export async function registerOfficeFontsForPptx(
  renderer: PptxFontRegistrar,
): Promise<void> {
  const jobs: Promise<unknown>[] = [
    renderer.registerFont("Calibri", `${FONT_BASE}/Calibri-Regular.ttf`, {
      weight: "400",
    }),
    renderer.registerFont("Calibri", `${FONT_BASE}/Calibri-Bold.ttf`, {
      weight: "700",
    }),
    renderer.registerFont("Calibri", `${FONT_BASE}/Calibri-Italic.ttf`, {
      weight: "400",
      style: "italic",
    }),
    renderer.registerFont("Calibri", `${FONT_BASE}/Calibri-BoldItalic.ttf`, {
      weight: "700",
      style: "italic",
    }),
    renderer.registerFont("Cambria", `${FONT_BASE}/Cambria-Regular.ttf`, {
      weight: "400",
    }),
    renderer.registerFont("Cambria", `${FONT_BASE}/Cambria-Bold.ttf`, {
      weight: "700",
    }),
    renderer.registerFont("Cambria", `${FONT_BASE}/Cambria-Italic.ttf`, {
      weight: "400",
      style: "italic",
    }),
    renderer.registerFont("Cambria", `${FONT_BASE}/Cambria-BoldItalic.ttf`, {
      weight: "700",
      style: "italic",
    }),
    // Theme aliases commonly seen in Office files
    renderer.registerFont("Calibri Light", `${FONT_BASE}/Calibri-Regular.ttf`, {
      weight: "300",
    }),
    renderer.registerFont("Aptos", `${FONT_BASE}/Calibri-Regular.ttf`, {
      weight: "400",
    }),
    renderer.registerFont("Aptos", `${FONT_BASE}/Calibri-Bold.ttf`, {
      weight: "700",
    }),
  ];
  await Promise.allSettled(jobs);
}

/** Fetch bundled TTF bytes for pdf-lib embedding (Excel → PDF). */
export async function loadOfficeFontBytes(): Promise<{
  regular: Uint8Array;
  bold: Uint8Array;
}> {
  const [regular, bold] = await Promise.all([
    fetch(`${FONT_BASE}/Calibri-Regular.ttf`).then((r) => {
      if (!r.ok) throw new Error("Could not load Office regular font.");
      return r.arrayBuffer();
    }),
    fetch(`${FONT_BASE}/Calibri-Bold.ttf`).then((r) => {
      if (!r.ok) throw new Error("Could not load Office bold font.");
      return r.arrayBuffer();
    }),
  ]);
  return {
    regular: new Uint8Array(regular),
    bold: new Uint8Array(bold),
  };
}
