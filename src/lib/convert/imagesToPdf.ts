import { PDFDocument } from "@/lib/pdf";

async function fileToImageBytes(file: File): Promise<{
  bytes: Uint8Array;
  kind: "png" | "jpg";
}> {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type === "image/png" || name.endsWith(".png")) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: "png" };
  }

  if (
    type === "image/jpeg" ||
    type === "image/jpg" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  ) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: "jpg" };
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
  if (!ctx) throw new Error("Canvas unavailable in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // Lossless PNG — never re-encode uploads as soft JPEG
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image."))),
      "image/png",
    );
  });

  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "png" };
}

export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  if (!files.length) throw new Error("Add at least one image.");

  const pdf = await PDFDocument.create();
  pdf.setTitle("LocalFold export");
  pdf.setProducer("LocalFold (local-only)");
  pdf.setCreator("LocalFold");

  for (const file of files) {
    const { bytes, kind } = await fileToImageBytes(file);
    const image =
      kind === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  return pdf.save({ useObjectStreams: true });
}
