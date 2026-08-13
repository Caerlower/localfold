/**
 * Office-compatible font fallbacks for document → PDF conversion.
 *
 * Many .docx/.pptx files name Calibri/Cambria/Times but don't embed the files.
 * html2canvas also clones into an iframe where relative `/fonts/...` URLs
 * often fail to load before rasterize — so we fetch TTFs once, register them
 * via FontFace, and inject base64 @font-face rules into capture clones.
 *
 * Fontless DOCXes (no theme / no rFonts) are common exports. macOS Preview and
 * classic Word render those in Times New Roman; we match that instead of
 * forcing Calibri (which made LocalFold PDFs look like a different document).
 */

const STYLE_ID = "lf-office-font-fallbacks";
const FONT_BASE = "/fonts/office";

type FaceSpec = {
  family: string;
  file: string;
  weight: string;
  style: string;
};

const FACE_SPECS: FaceSpec[] = [
  { family: "Calibri", file: "Calibri-Regular.ttf", weight: "400", style: "normal" },
  { family: "Calibri", file: "Calibri-Bold.ttf", weight: "700", style: "normal" },
  { family: "Calibri", file: "Calibri-Italic.ttf", weight: "400", style: "italic" },
  { family: "Calibri", file: "Calibri-BoldItalic.ttf", weight: "700", style: "italic" },
  { family: "Cambria", file: "Cambria-Regular.ttf", weight: "400", style: "normal" },
  { family: "Cambria", file: "Cambria-Bold.ttf", weight: "700", style: "normal" },
  { family: "Cambria", file: "Cambria-Italic.ttf", weight: "400", style: "italic" },
  { family: "Cambria", file: "Cambria-BoldItalic.ttf", weight: "700", style: "italic" },
  // Liberation Serif stand-ins (metric-compatible with Times New Roman)
  {
    family: "Times New Roman",
    file: "TimesNewRoman-Regular.ttf",
    weight: "400",
    style: "normal",
  },
  {
    family: "Times New Roman",
    file: "TimesNewRoman-Bold.ttf",
    weight: "700",
    style: "normal",
  },
  {
    family: "Times New Roman",
    file: "TimesNewRoman-Italic.ttf",
    weight: "400",
    style: "italic",
  },
  {
    family: "Times New Roman",
    file: "TimesNewRoman-BoldItalic.ttf",
    weight: "700",
    style: "italic",
  },
];

export type DocxFontProfile = {
  /** True when the package names theme fonts or rFonts. */
  hasExplicitFonts: boolean;
  /** CSS stack for unstyled runs / host root. */
  bodyStack: string;
  /** Theme major (headings) fallback. */
  majorStack: string;
  /** Theme minor (body) fallback. */
  minorStack: string;
};

const OFFICE_BODY =
  'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
const OFFICE_MAJOR =
  'Cambria, Caladea, "Times New Roman", Times, serif';
const SERIF_BODY =
  '"Times New Roman", Times, Cambria, Georgia, serif';

/** Build host CSS that isolates the Word tree from the site UI font. */
export function docxHostCss(profile: DocxFontProfile): string {
  return `
.lf-docx-root {
  font-family: ${profile.bodyStack} !important;
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
  font-family: inherit;
  --docx-majorHAnsi-font: ${profile.majorStack};
  --docx-minorHAnsi-font: ${profile.minorStack};
  --docx-majorEastAsia-font: "Segoe UI", Arial, sans-serif;
  --docx-minorEastAsia-font: "Segoe UI", Arial, sans-serif;
  --docx-majorBidi-font: Arial, sans-serif;
  --docx-minorBidi-font: Arial, sans-serif;
}
`;
}

/** @deprecated use docxHostCss(profile) — kept for any stray imports */
export const DOCX_HOST_CSS = docxHostCss({
  hasExplicitFonts: true,
  bodyStack: OFFICE_BODY,
  majorStack: OFFICE_MAJOR,
  minorStack: OFFICE_BODY,
});

type CachedFace = FaceSpec & { dataUrl: string; buffer: ArrayBuffer };

let cachePromise: Promise<CachedFace[]> | null = null;
let fontsReady: Promise<void> | null = null;
let cachedCss: string | null = null;

function bytesToDataUrl(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:font/ttf;base64,${btoa(binary)}`;
}

async function loadFaceCache(): Promise<CachedFace[]> {
  if (!cachePromise) {
    cachePromise = Promise.all(
      FACE_SPECS.map(async (spec) => {
        const res = await fetch(`${FONT_BASE}/${spec.file}`);
        if (!res.ok) {
          throw new Error(`Missing Office font asset: ${spec.file}`);
        }
        const buffer = await res.arrayBuffer();
        return { ...spec, buffer, dataUrl: bytesToDataUrl(buffer) };
      }),
    ).catch((err) => {
      cachePromise = null;
      throw err;
    });
  }
  return cachePromise;
}

function buildFaceCss(faces: CachedFace[]): string {
  const rules = faces.map(
    (f) => `@font-face {
  font-family: "${f.family}";
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: block;
  src: local("${f.family}${f.weight === "700" ? " Bold" : ""}${f.style === "italic" ? " Italic" : ""}"),
    url("${f.dataUrl}") format("truetype");
}`,
  );
  rules.push(`@font-face {
  font-family: "Arial";
  font-style: normal;
  font-weight: 400;
  src: local("Arial"), local("Helvetica Neue"), local("Helvetica");
}
@font-face {
  font-family: "Arial";
  font-style: normal;
  font-weight: 700;
  src: local("Arial Bold"), local("Helvetica Neue Bold");
}
@font-face {
  font-family: "Georgia";
  font-style: normal;
  font-weight: 400;
  src: local("Georgia"), local("Palatino Linotype");
}
@font-face {
  font-family: "Courier New";
  font-style: normal;
  font-weight: 400;
  src: local("Courier New"), local("Courier");
}`);
  return rules.join("\n");
}

function injectCss(css: string, doc: Document = document): void {
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = css;
}

/**
 * Inspect a .docx package: if it never names a font / has no theme, treat it
 * as a Times document (Preview / classic Word default), not Calibri.
 */
export async function inspectDocxFontProfile(
  data: ArrayBuffer,
): Promise<DocxFontProfile> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(data);
    const names = Object.keys(zip.files);

    const hasTheme = names.some((n) =>
      /^word\/theme\/theme\d*\.xml$/i.test(n),
    );
    const hasEmbedded = names.some((n) => /^word\/fonts\//i.test(n));

    const xmlParts = [
      "word/styles.xml",
      "word/document.xml",
      "word/fontTable.xml",
      "word/header1.xml",
      "word/footer1.xml",
    ];
    let named = false;
    for (const part of xmlParts) {
      const file = zip.file(part);
      if (!file) continue;
      const xml = await file.async("string");
      if (
        /w:(?:ascii|hAnsi|cs|eastAsia)\s*=\s*"[^"]+"/i.test(xml) ||
        /w:(?:ascii|hAnsi)Theme\s*=\s*"[^"]+"/i.test(xml) ||
        /typeface\s*=\s*"[^"]+"/i.test(xml) ||
        /<w:font\b[^>]*w:name="/i.test(xml)
      ) {
        named = true;
        break;
      }
    }

    if (hasTheme || hasEmbedded || named) {
      return {
        hasExplicitFonts: true,
        bodyStack: OFFICE_BODY,
        majorStack: OFFICE_MAJOR,
        minorStack: OFFICE_BODY,
      };
    }
  } catch {
    /* fall through to serif default */
  }

  return {
    hasExplicitFonts: false,
    bodyStack: SERIF_BODY,
    majorStack: SERIF_BODY,
    minorStack: SERIF_BODY,
  };
}

/** Load Calibri/Cambria/Times stand-ins via FontFace + data-URL CSS (clone-safe). */
export async function ensureOfficeFontFallbacks(): Promise<void> {
  if (typeof document === "undefined") return;

  if (!fontsReady) {
    fontsReady = (async () => {
      try {
        const faces = await loadFaceCache();
        cachedCss = buildFaceCss(faces);
        injectCss(cachedCss);

        await Promise.all(
          faces.map(async (f) => {
            try {
              const face = new FontFace(f.family, f.buffer.slice(0), {
                weight: f.weight,
                style: f.style,
                display: "block",
              });
              await face.load();
              document.fonts.add(face);
            } catch {
              /* CSS data-URL path may still work */
            }
          }),
        );

        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]);
        await Promise.all(
          [
            "400 12px Calibri",
            "700 12px Calibri",
            "italic 400 12px Calibri",
            "400 12px Cambria",
            "700 12px Cambria",
            "400 12px 'Times New Roman'",
            "700 12px 'Times New Roman'",
            "italic 400 12px 'Times New Roman'",
          ].map((f) => document.fonts.load(f).catch(() => undefined)),
        );
      } catch {
        fontsReady = null;
        injectCss(`@font-face {
  font-family: "Calibri";
  src: local("Calibri"), local("Carlito"), url("${FONT_BASE}/Calibri-Regular.ttf") format("truetype");
}
@font-face {
  font-family: "Times New Roman";
  src: local("Times New Roman"), local("Times"), url("${FONT_BASE}/TimesNewRoman-Regular.ttf") format("truetype");
}`);
      }
    })();
  }

  await fontsReady;
}

/**
 * Append fallbacks to bare inline font-family values, and replace empty theme
 * vars / site UI fonts with the document default stack.
 */
export function reinforceElementFonts(
  root: HTMLElement,
  fallbackStack: string = OFFICE_BODY,
): void {
  const nodes = [
    root,
    ...Array.from(root.querySelectorAll<HTMLElement>("*")),
  ];
  for (const el of nodes) {
    const inline = el.style.fontFamily?.trim();
    if (!inline) {
      const cs = getComputedStyle(el).fontFamily || "";
      if (!cs || /outfit|fraunces|var\(--font/i.test(cs)) {
        el.style.fontFamily = fallbackStack;
      }
      continue;
    }
    const lower = inline.toLowerCase();
    if (
      lower.includes("var(--docx-") ||
      lower === "inherit" ||
      /outfit|fraunces/i.test(lower)
    ) {
      el.style.fontFamily = fallbackStack;
      continue;
    }
    if (
      lower.includes("sans-serif") ||
      lower.includes("serif") ||
      lower.includes("monospace") ||
      lower.includes("carlito") ||
      lower.includes("liberation")
    ) {
      continue;
    }
    const tail = fallbackStack.includes("serif")
      ? '"Times New Roman", Times, serif'
      : 'Carlito, "Segoe UI", Arial, sans-serif';
    el.style.fontFamily = `${inline}, ${tail}`;
  }
}

/** Bake computed font-family onto inline styles (survives html2canvas clone). */
export function bakeComputedFonts(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const family = getComputedStyle(el).fontFamily;
    if (family) el.style.fontFamily = family;
  }
}

/** Inject clone-safe (base64) @font-face rules into an html2canvas document. */
export function injectOfficeFontsIntoDocument(doc: Document): void {
  const css =
    cachedCss ||
    `@font-face {
  font-family: "Times New Roman";
  src: local("Times New Roman"), url("${FONT_BASE}/TimesNewRoman-Regular.ttf") format("truetype");
}`;
  injectCss(css, doc);
}

/**
 * Inject base64 faces into a document (e.g. html2canvas iframe) and wait until
 * Office faces are usable for rasterization.
 */
export async function primeOfficeFontsInDocument(doc: Document): Promise<void> {
  injectOfficeFontsIntoDocument(doc);
  try {
    const faces = await loadFaceCache();
    const win = doc.defaultView as (Window & typeof globalThis) | null;
    const FontFaceCtor = win?.FontFace ?? FontFace;
    await Promise.all(
      faces.map(async (f) => {
        try {
          const face = new FontFaceCtor(f.family, f.buffer.slice(0), {
            weight: f.weight,
            style: f.style,
            display: "block",
          });
          await face.load();
          doc.fonts.add(face);
        } catch {
          /* CSS data-URL path may still work */
        }
      }),
    );
    await Promise.race([
      doc.fonts.ready,
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    await Promise.all(
      [
        "400 12px Calibri",
        "700 12px Calibri",
        "italic 400 12px Calibri",
        "400 12px Cambria",
        "700 12px Cambria",
        "400 12px 'Times New Roman'",
        "700 12px 'Times New Roman'",
        "italic 400 12px 'Times New Roman'",
      ].map((f) => doc.fonts.load(f).catch(() => undefined)),
    );
  } catch {
    /* keep CSS-only fallback */
  }
}

type PptxFontRegistrar = {
  registerFont: (
    family: string,
    source: string,
    descriptors?: { weight?: string; style?: string },
  ) => Promise<unknown>;
};

/** Point pptx-browser at local Calibri/Cambria stand-ins (data URLs preferred). */
export async function registerOfficeFontsForPptx(
  renderer: PptxFontRegistrar,
): Promise<void> {
  let faces: CachedFace[] = [];
  try {
    faces = await loadFaceCache();
  } catch {
    await Promise.allSettled(
      FACE_SPECS.map((f) =>
        renderer.registerFont(f.family, `${FONT_BASE}/${f.file}`, {
          weight: f.weight,
          style: f.style,
        }),
      ),
    );
    return;
  }

  await Promise.allSettled(
    faces.map((f) =>
      renderer.registerFont(f.family, f.dataUrl, {
        weight: f.weight,
        style: f.style,
      }),
    ),
  );

  const regular = faces.find(
    (f) => f.family === "Calibri" && f.weight === "400" && f.style === "normal",
  );
  const bold = faces.find(
    (f) => f.family === "Calibri" && f.weight === "700" && f.style === "normal",
  );
  if (regular) {
    await Promise.allSettled([
      renderer.registerFont("Calibri Light", regular.dataUrl, { weight: "300" }),
      renderer.registerFont("Aptos", regular.dataUrl, { weight: "400" }),
    ]);
  }
  if (bold) {
    await Promise.allSettled([
      renderer.registerFont("Aptos", bold.dataUrl, { weight: "700" }),
    ]);
  }
}

/** Fetch bundled TTF bytes for pdf-lib embedding (Excel → PDF). */
export async function loadOfficeFontBytes(): Promise<{
  regular: Uint8Array;
  bold: Uint8Array;
}> {
  const faces = await loadFaceCache();
  const regular = faces.find(
    (f) => f.family === "Calibri" && f.weight === "400" && f.style === "normal",
  );
  const bold = faces.find(
    (f) => f.family === "Calibri" && f.weight === "700" && f.style === "normal",
  );
  if (!regular || !bold) {
    throw new Error("Office font cache incomplete.");
  }
  return {
    regular: new Uint8Array(regular.buffer.slice(0)),
    bold: new Uint8Array(bold.buffer.slice(0)),
  };
}
