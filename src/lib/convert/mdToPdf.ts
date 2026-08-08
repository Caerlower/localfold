import { marked } from "marked";
import { htmlStringToPdf } from "./htmlToPdf";

export async function markdownToPdf(
  markdown: string,
  title = "LocalFold markdown export",
): Promise<Uint8Array> {
  const body = await marked.parse(markdown, { gfm: true, breaks: true });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${escapeAttr(title)}</title>
<style>
  @page { margin: 0; }
  body {
    font-family: "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: 11.5pt;
    line-height: 1.55;
    color: #1a1a1a;
    margin: 0;
    padding: 48px 56px;
    width: 720px;
    background: #fff;
  }
  h1, h2, h3, h4 {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    line-height: 1.25;
    margin: 1.4em 0 0.45em;
    color: #111;
  }
  h1 { font-size: 24pt; margin-top: 0; }
  h2 { font-size: 16pt; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.2em; }
  h3 { font-size: 13pt; }
  p { margin: 0 0 0.85em; }
  ul, ol { margin: 0 0 0.9em; padding-left: 1.4em; }
  li { margin: 0.25em 0; }
  blockquote {
    margin: 0 0 1em;
    padding: 0.2em 0 0.2em 1em;
    border-left: 3px solid #c9c9c9;
    color: #444;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    background: #f4f4f4;
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }
  pre {
    background: #f4f4f4;
    padding: 12px 14px;
    border-radius: 6px;
    overflow: auto;
    margin: 0 0 1em;
  }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 1em; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; }
  img { max-width: 100%; height: auto; }
  a { color: #0b57d0; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 1.5em 0; }
</style></head><body>${body || "<p>(empty markdown)</p>"}</body></html>`;

  return htmlStringToPdf(html);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export async function markdownFileToPdf(file: File): Promise<Uint8Array> {
  const markdown = await file.text();
  return markdownToPdf(markdown, file.name);
}
