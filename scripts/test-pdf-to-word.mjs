/**
 * Headless smoke test: render a sample PDF → visual DOCX in Chromium.
 * Run: node scripts/test-pdf-to-word.mjs
 */
import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const outDir = join(process.cwd(), ".tmp-test");
mkdirSync(outDir, { recursive: true });

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([612, 792]);
const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
const body = await pdfDoc.embedFont(StandardFonts.Helvetica);
page.drawText("MANAV GOYAL", {
  x: 72,
  y: 720,
  size: 28,
  font,
  color: rgb(0.1, 0.1, 0.1),
});
page.drawText("Software Engineer", {
  x: 72,
  y: 690,
  size: 14,
  font: body,
  color: rgb(0.2, 0.2, 0.2),
});
page.drawText("Experience", {
  x: 72,
  y: 640,
  size: 16,
  font,
});
page.drawText("Built LocalFold — private PDF tools in the browser.", {
  x: 72,
  y: 610,
  size: 12,
  font: body,
});
page.drawRectangle({
  x: 72,
  y: 500,
  width: 200,
  height: 80,
  borderColor: rgb(0.1, 0.5, 0.3),
  borderWidth: 2,
});
const pdfBytes = await pdfDoc.save();
const pdfPath = join(outDir, "sample-resume.pdf");
writeFileSync(pdfPath, pdfBytes);

const browser = await chromium.launch();
const pageBr = await browser.newPage();

pageBr.on("console", (msg) => {
  if (msg.type() === "error") console.error("BROWSER:", msg.text());
});
pageBr.on("pageerror", (err) => console.error("PAGEERROR:", err.message));

await pageBr.goto("http://localhost:3000/tool/pdf-to-word", {
  waitUntil: "networkidle",
});

const downloadPromise = pageBr.waitForEvent("download", { timeout: 60000 });
await pageBr.setInputFiles('input[type="file"]', pdfPath);
await pageBr.getByRole("button", { name: /Download DOCX/i }).click();

const download = await downloadPromise;
const outPath = join(outDir, await download.suggestedFilename());
await download.saveAs(outPath);
await browser.close();

const size = readFileSync(outPath).byteLength;
console.log("Wrote", outPath, "bytes=", size);

// DOCX is a zip — must start with PK
const magic = readFileSync(outPath).subarray(0, 2).toString("utf8");
if (magic !== "PK") {
  console.error("FAIL: output is not a zip/docx");
  process.exit(1);
}
if (size < 5000) {
  console.error("FAIL: docx too small, likely empty");
  process.exit(1);
}

// Ensure media image exists inside
const { default: JSZip } = await import("jszip");
const zip = await JSZip.loadAsync(readFileSync(outPath));
const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/"));
console.log("media files:", media);
if (!media.length) {
  console.error("FAIL: no images embedded in docx");
  process.exit(1);
}
console.log("PASS: visual PDF→Word works");
