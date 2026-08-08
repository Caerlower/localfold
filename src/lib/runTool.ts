import type { ToolId } from "./tools";
import { basename } from "./format";
import { imagesToPdf } from "./convert/imagesToPdf";
import { markdownFileToPdf } from "./convert/mdToPdf";
import { textToPdf } from "./convert/textToPdf";
import { htmlFileToPdf } from "./convert/htmlToPdf";
import { ocrPdf } from "./convert/ocr";
import {
  addPageNumbers,
  addWatermark,
  cropPdf,
  mergePdfs,
  organizePdf,
  pdfToImages,
  pdfToImagesZip,
  pdfToMarkdown,
  protectPdf,
  redactPdf,
  repairPdf,
  rotatePdf,
  signPdf,
  splitPdf,
  stampText,
  unlockPdf,
} from "./convert/pdfOps";
import { compressPdfToTarget } from "./convert/compressPdf";
import {
  excelToPdf,
  pdfToExcel,
  pdfToPowerpoint,
  pdfToWord,
  powerpointToPdf,
  wordToPdf,
  type FidelityMode,
} from "./convert/office";

export type RunOptions = {
  password?: string;
  text?: string;
  deletePages?: string;
  reverse?: boolean;
  pageOrder?: number[];
  cropMargin?: number;
  fidelity?: FidelityMode;
  targetSize?: number;
  targetUnit?: "KB" | "MB";
  /** PDF → images format */
  imageFormat?: "png" | "jpeg";
  /** ZIP archive vs individual image downloads */
  imagePack?: "zip" | "files";
  onProgress?: (msg: string) => void;
};

export type RunResult = {
  blob: Blob;
  filename: string;
  /** Extra files when downloading pages individually */
  files?: { blob: Blob; filename: string }[];
};

function pdfBlob(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export async function runTool(
  toolId: ToolId,
  files: File[],
  options: RunOptions = {},
): Promise<RunResult> {
  const first = files[0];
  const base = first ? basename(first.name) : "localfold";
  const fidelity = options.fidelity ?? "visual";
  const onProgress = options.onProgress;

  switch (toolId) {
    case "merge-pdf":
      return {
        blob: pdfBlob(await mergePdfs(files)),
        filename: "merged.pdf",
      };
    case "split-pdf":
      return {
        blob: await splitPdf(first),
        filename: `${base}-split.zip`,
      };
    case "organize-pdf": {
      const pageOrder = options.pageOrder;
      if (!pageOrder?.length) {
        throw new Error("Keep at least one page to download.");
      }
      return {
        blob: pdfBlob(await organizePdf(first, { pageOrder })),
        filename: `${base}-organized.pdf`,
      };
    }
    case "compress-pdf": {
      const amount = options.targetSize ?? 0;
      const unit = options.targetUnit ?? "KB";
      const targetBytes =
        unit === "MB" ? amount * 1024 * 1024 : amount * 1024;
      const result = await compressPdfToTarget(
        first,
        targetBytes,
        onProgress,
      );
      onProgress?.(result.note);
      return {
        blob: pdfBlob(result.bytes),
        filename: `${base}-compressed.pdf`,
      };
    }
    case "repair-pdf":
      return {
        blob: pdfBlob(await repairPdf(first)),
        filename: `${base}-repaired.pdf`,
      };
    case "word-to-pdf":
      return {
        blob: pdfBlob(await wordToPdf(first, onProgress)),
        filename: `${base}.pdf`,
      };
    case "powerpoint-to-pdf":
      return {
        blob: pdfBlob(await powerpointToPdf(first, onProgress)),
        filename: `${base}.pdf`,
      };
    case "excel-to-pdf":
      return {
        blob: pdfBlob(await excelToPdf(first, onProgress)),
        filename: `${base}.pdf`,
      };
    case "images-to-pdf":
    case "scan-to-pdf":
      return {
        blob: pdfBlob(await imagesToPdf(files)),
        filename: `${base || "images"}.pdf`,
      };
    case "html-to-pdf":
      return {
        blob: pdfBlob(await htmlFileToPdf(first)),
        filename: `${base}.pdf`,
      };
    case "md-to-pdf":
      return {
        blob: pdfBlob(await markdownFileToPdf(first)),
        filename: `${base}.pdf`,
      };
    case "txt-to-pdf":
      return {
        blob: pdfBlob(await textToPdf(await first.text(), first.name)),
        filename: `${base}.pdf`,
      };
    case "pdf-to-word":
      return {
        blob: await pdfToWord(first, fidelity, onProgress),
        filename: `${base}.docx`,
      };
    case "pdf-to-powerpoint":
      return {
        blob: await pdfToPowerpoint(first, onProgress),
        filename: `${base}.pptx`,
      };
    case "pdf-to-excel":
      return {
        blob: await pdfToExcel(first, onProgress),
        filename: `${base}.xlsx`,
      };
    case "pdf-to-images": {
      const format = options.imageFormat ?? "png";
      const pack = options.imagePack ?? "zip";
      if (pack === "files") {
        const pages = await pdfToImages(first, format, onProgress);
        if (!pages.length) throw new Error("No pages to export.");
        return {
          blob: pages[0].blob,
          filename: pages[0].filename,
          files: pages,
        };
      }
      return {
        blob: await pdfToImagesZip(first, format, onProgress),
        filename: `${base}-pages.zip`,
      };
    }
    case "pdf-to-markdown":
      return {
        blob: await pdfToMarkdown(first),
        filename: `${base}.md`,
      };
    case "edit-pdf":
      return {
        blob: pdfBlob(await stampText(first, options.text || "")),
        filename: `${base}-edited.pdf`,
      };
    case "watermark":
      return {
        blob: pdfBlob(await addWatermark(first, options.text || "")),
        filename: `${base}-watermarked.pdf`,
      };
    case "page-numbers":
      return {
        blob: pdfBlob(await addPageNumbers(first)),
        filename: `${base}-numbered.pdf`,
      };
    case "crop-pdf":
      return {
        blob: pdfBlob(await cropPdf(first, options.cropMargin ?? 36)),
        filename: `${base}-cropped.pdf`,
      };
    case "rotate-pdf":
      return {
        blob: pdfBlob(await rotatePdf(first, 90)),
        filename: `${base}-rotated.pdf`,
      };
    case "sign-pdf":
      return {
        blob: pdfBlob(await signPdf(first, options.text || "")),
        filename: `${base}-signed.pdf`,
      };
    case "unlock-pdf":
      return {
        blob: pdfBlob(await unlockPdf(first, options.password || "")),
        filename: `${base}-unlocked.pdf`,
      };
    case "protect-pdf":
      return {
        blob: pdfBlob(await protectPdf(first, options.password || "")),
        filename: `${base}-protected.pdf`,
      };
    case "redact-pdf":
      return {
        blob: pdfBlob(await redactPdf(first, options.text || "")),
        filename: `${base}-redacted.pdf`,
      };
    case "ocr-pdf":
      return {
        blob: pdfBlob(await ocrPdf(first, onProgress)),
        filename: `${base}-ocr.pdf`,
      };
    case "compare-pdf":
      throw new Error("Compare opens the side-by-side viewer — no download.");
    default:
      throw new Error("Unknown tool");
  }
}
