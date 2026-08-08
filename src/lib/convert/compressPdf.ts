import { PDFDocument } from "@/lib/pdf";
import { canvasToBytes, loadPdfJs, renderPageToCanvas } from "./pdfjs";
import { formatBytes } from "@/lib/format";

export type CompressResult = {
  bytes: Uint8Array;
  originalSize: number;
  outputSize: number;
  note: string;
};

async function losslessPass(original: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  doc.setProducer("LocalFold");
  doc.setCreator("LocalFold");
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  const bytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  return bytes.length < original.length ? bytes : original;
}

async function rebuildAtQuality(
  fileBytes: Uint8Array,
  scale: number,
  jpegQuality: number,
): Promise<Uint8Array> {
  const src = await loadPdfJs(fileBytes);
  const out = await PDFDocument.create();
  out.setProducer("LocalFold compress");
  out.setCreator("LocalFold");

  for (let i = 1; i <= src.numPages; i += 1) {
    const { canvas, viewport, scale: usedScale } = await renderPageToCanvas(
      src,
      i,
      scale,
    );
    const jpg = await canvasToBytes(canvas, "image/jpeg", jpegQuality);
    const image = await out.embedJpg(jpg);
    const pageW = viewport.width / usedScale;
    const pageH = viewport.height / usedScale;
    const page = out.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  }

  src.cleanup();
  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

type Knob = { scale: number; quality: number };

/** Higher score = sharper output (prefer when both are under target). */
function knobScore(k: Knob) {
  return k.scale * 10 + k.quality;
}

/**
 * Compress toward a target byte size.
 * Goal: largest file that is still ≤ target (use the size you asked for).
 */
export async function compressPdfToTarget(
  file: File,
  targetBytes: number,
  onProgress?: (msg: string) => void,
): Promise<CompressResult> {
  const originalSize = file.size;
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    throw new Error("Enter a valid target size greater than 0.");
  }
  if (targetBytes >= originalSize) {
    throw new Error(
      `Target (${formatBytes(targetBytes)}) must be smaller than the current file (${formatBytes(originalSize)}).`,
    );
  }

  const original = new Uint8Array(await file.arrayBuffer());

  onProgress?.("Trying lossless compression first…");
  const lossless = await losslessPass(original);

  // Only accept lossless if it actually reaches the target (or is close enough).
  // Otherwise keep going — users asked for a specific size budget to fill.
  if (lossless.length <= targetBytes && lossless.length >= targetBytes * 0.9) {
    return {
      bytes: lossless,
      originalSize,
      outputSize: lossless.length,
      note: `Hit target with lossless compress: ${formatBytes(originalSize)} → ${formatBytes(lossless.length)}.`,
    };
  }

  let bestUnder: { bytes: Uint8Array; knob: Knob } | null = null;
  if (lossless.length <= targetBytes) {
    // Lossless got under target but maybe too small — still a valid fallback
    bestUnder = {
      bytes: lossless,
      knob: { scale: 99, quality: 1 }, // prefer this only if lossy can't get closer
    };
  }

  // Search from sharp → soft so we land as close under the target as possible
  const scales = [3.0, 2.6, 2.3, 2.0, 1.75, 1.5, 1.35, 1.2, 1.05, 0.9, 0.75];

  for (let s = 0; s < scales.length; s += 1) {
    const scale = scales[s];
    onProgress?.(
      `Tuning to ${formatBytes(targetBytes)}… pass ${s + 1}/${scales.length}`,
    );

    // Binary search JPEG quality at this DPI — maximize quality while ≤ target
    let lo = 0.28;
    let hi = 0.96;
    let localBest: { bytes: Uint8Array; quality: number } | null = null;

    for (let step = 0; step < 7; step += 1) {
      const mid = (lo + hi) / 2;
      const candidate = await rebuildAtQuality(original, scale, mid);

      if (candidate.length <= targetBytes) {
        localBest = { bytes: candidate, quality: mid };
        lo = mid; // can afford more quality
      } else {
        hi = mid; // too big — reduce quality
      }
    }

    if (localBest) {
      const knob = { scale, quality: localBest.quality };
      if (
        !bestUnder ||
        // Prefer larger file (closer to target), then sharper knobs
        localBest.bytes.length > bestUnder.bytes.length ||
        (localBest.bytes.length === bestUnder.bytes.length &&
          knobScore(knob) > knobScore(bestUnder.knob))
      ) {
        bestUnder = { bytes: localBest.bytes, knob };
      }

      // If we're within 8% of the target, stop — good enough and saves time
      if (localBest.bytes.length >= targetBytes * 0.92) {
        break;
      }
      // Already under at a high scale with high quality — try one sharper scale only if needed
      // Continue outer loop in case a different scale fills the budget better
    }
  }

  if (!bestUnder) {
    // Could not get under target even at lowest settings — return smallest we made
    onProgress?.("Target is very small — using maximum compression…");
    const smallest = await rebuildAtQuality(original, 0.65, 0.28);
    if (smallest.length >= originalSize) {
      throw new Error(
        "Could not shrink this PDF further. It may already be highly compressed.",
      );
    }
    return {
      bytes: smallest,
      originalSize,
      outputSize: smallest.length,
      note: `Best effort: ${formatBytes(originalSize)} → ${formatBytes(smallest.length)} (could not reach ${formatBytes(targetBytes)}). Try a larger target.`,
    };
  }

  const output = bestUnder.bytes;
  // If lossless was our only under-target result and lossy never beat it on size proximity, use bestUnder
  const pct = Math.round((output.length / targetBytes) * 100);

  return {
    bytes: output,
    originalSize,
    outputSize: output.length,
    note: `Compressed ${formatBytes(originalSize)} → ${formatBytes(output.length)} (${pct}% of your ${formatBytes(targetBytes)} target).`,
  };
}
