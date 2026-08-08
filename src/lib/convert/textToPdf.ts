import { PDFDocument, StandardFonts, rgb } from "@/lib/pdf";

function wrapLine(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (word.length > maxChars) {
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      current = "";
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function textToPdf(
  text: string,
  title = "LocalFold text export",
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("LocalFold (local-only)");
  pdf.setCreator("LocalFold");

  const font = await pdf.embedFont(StandardFonts.Courier);
  const fontSize = 11;
  const lineHeight = 15;
  const margin = 48;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  const maxChars = Math.floor(maxWidth / (fontSize * 0.6));

  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines = paragraphs.flatMap((p) => wrapLine(p, maxChars));

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(line || " ", {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0.07, 0.1, 0.09),
      maxWidth,
    });
    y -= lineHeight;
  }

  return pdf.save({ useObjectStreams: true });
}
