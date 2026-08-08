export type CategoryId =
  | "all"
  | "organize"
  | "optimize"
  | "to-pdf"
  | "from-pdf"
  | "edit"
  | "security"
  | "smart";

export type ToolId =
  | "merge-pdf"
  | "split-pdf"
  | "organize-pdf"
  | "compress-pdf"
  | "repair-pdf"
  | "word-to-pdf"
  | "powerpoint-to-pdf"
  | "excel-to-pdf"
  | "images-to-pdf"
  | "html-to-pdf"
  | "md-to-pdf"
  | "txt-to-pdf"
  | "scan-to-pdf"
  | "pdf-to-word"
  | "pdf-to-powerpoint"
  | "pdf-to-excel"
  | "pdf-to-images"
  | "pdf-to-markdown"
  | "edit-pdf"
  | "watermark"
  | "page-numbers"
  | "crop-pdf"
  | "rotate-pdf"
  | "sign-pdf"
  | "unlock-pdf"
  | "protect-pdf"
  | "redact-pdf"
  | "ocr-pdf"
  | "compare-pdf";

export type ToolDef = {
  id: ToolId;
  title: string;
  blurb: string;
  category: Exclude<CategoryId, "all">;
  accept: string;
  multiple: boolean;
  output: string;
  hint: string;
  accent: string;
  badge?: string;
  needsPassword?: boolean;
  needsText?: boolean;
  needsScan?: boolean;
  needsCompare?: boolean;
  needsOptions?: boolean;
};

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "organize", label: "Organize" },
  { id: "optimize", label: "Optimize" },
  { id: "to-pdf", label: "To PDF" },
  { id: "from-pdf", label: "From PDF" },
  { id: "edit", label: "Edit" },
  { id: "security", label: "Security" },
  { id: "smart", label: "Smart" },
];

export const TOOLS: ToolDef[] = [
  {
    id: "merge-pdf",
    title: "Merge PDF",
    blurb: "Combine PDFs into one file.",
    category: "organize",
    accept: "application/pdf,.pdf",
    multiple: true,
    output: "PDF",
    hint: "Reorder files, then download one PDF.",
    accent: "#E74C3C",
  },
  {
    id: "split-pdf",
    title: "Split PDF",
    blurb: "Extract pages into separate files.",
    category: "organize",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "ZIP",
    hint: "Split by page or by range.",
    accent: "#E67E22",
  },
  {
    id: "organize-pdf",
    title: "Organize PDF",
    blurb: "Reorder or remove pages.",
    category: "organize",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Drag to reorder, remove what you don’t need.",
    accent: "#8E44AD",
  },
  {
    id: "compress-pdf",
    title: "Compress PDF",
    blurb: "Shrink to a target file size.",
    category: "optimize",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Set a size in KB or MB.",
    accent: "#27AE60",
    needsOptions: true,
  },
  {
    id: "repair-pdf",
    title: "Repair PDF",
    blurb: "Rebuild a damaged PDF.",
    category: "optimize",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Best-effort local repair.",
    accent: "#16A085",
  },
  {
    id: "word-to-pdf",
    title: "Word to PDF",
    blurb: "Convert .docx to PDF.",
    category: "to-pdf",
    accept:
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: false,
    output: "PDF",
    hint: "Keeps layout, styles, and images.",
    accent: "#2B579A",
  },
  {
    id: "powerpoint-to-pdf",
    title: "PowerPoint to PDF",
    blurb: "Export slides as PDF.",
    category: "to-pdf",
    accept:
      ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    multiple: false,
    output: "PDF",
    hint: "Preserves design, shapes, and fonts.",
    accent: "#D24726",
  },
  {
    id: "excel-to-pdf",
    title: "Excel to PDF",
    blurb: "Convert sheets to PDF.",
    category: "to-pdf",
    accept:
      ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
    multiple: false,
    output: "PDF",
    hint: "Keeps fills, fonts, and sheet names.",
    accent: "#1D6F42",
  },
  {
    id: "images-to-pdf",
    title: "JPG to PDF",
    blurb: "Images into one PDF.",
    category: "to-pdf",
    accept:
      "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.bmp",
    multiple: true,
    output: "PDF",
    hint: "PNG, JPG, WebP, GIF — order preserved.",
    accent: "#F39C12",
  },
  {
    id: "html-to-pdf",
    title: "HTML to PDF",
    blurb: "Render HTML as PDF.",
    category: "to-pdf",
    accept: ".html,.htm,text/html",
    multiple: false,
    output: "PDF",
    hint: "Captures a local HTML snapshot.",
    accent: "#E67E22",
  },
  {
    id: "md-to-pdf",
    title: "Markdown to PDF",
    blurb: "Notes to a printable PDF.",
    category: "to-pdf",
    accept: ".md,text/markdown,text/x-markdown",
    multiple: false,
    output: "PDF",
    hint: "Headings, tables, and code supported.",
    accent: "#34495E",
  },
  {
    id: "txt-to-pdf",
    title: "Text to PDF",
    blurb: "Plain text to PDF.",
    category: "to-pdf",
    accept: ".txt,text/plain",
    multiple: false,
    output: "PDF",
    hint: "Keeps line breaks.",
    accent: "#7F8C8D",
  },
  {
    id: "scan-to-pdf",
    title: "Scan to PDF",
    blurb: "Camera pages to PDF.",
    category: "to-pdf",
    accept: "image/*",
    multiple: true,
    output: "PDF",
    hint: "Use your camera or upload photos.",
    accent: "#2980B9",
    needsScan: true,
    badge: "Popular",
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    blurb: "PDF pages to .docx.",
    category: "from-pdf",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "DOCX",
    hint: "Visual fidelity by default; editable text optional.",
    accent: "#2B579A",
    needsOptions: true,
  },
  {
    id: "pdf-to-powerpoint",
    title: "PDF to PowerPoint",
    blurb: "Each page becomes a slide.",
    category: "from-pdf",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PPTX",
    hint: "Pages as slide images.",
    accent: "#D24726",
  },
  {
    id: "pdf-to-excel",
    title: "PDF to Excel",
    blurb: "Tables to .xlsx.",
    category: "from-pdf",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "XLSX",
    hint: "Layout detection with OCR fallback.",
    accent: "#1D6F42",
  },
  {
    id: "pdf-to-images",
    title: "PDF to JPG",
    blurb: "Export pages as images.",
    category: "from-pdf",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "Images",
    hint: "PNG or JPG at high resolution.",
    accent: "#F39C12",
    needsOptions: true,
  },
  {
    id: "pdf-to-markdown",
    title: "PDF to Markdown",
    blurb: "Extract text to .md.",
    category: "from-pdf",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "MD",
    hint: "Plain text with page headings.",
    accent: "#8E44AD",
    badge: "New",
  },
  {
    id: "edit-pdf",
    title: "Edit PDF",
    blurb: "Stamp text on pages.",
    category: "edit",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Place text with the position grid.",
    accent: "#C0392B",
  },
  {
    id: "watermark",
    title: "Watermark",
    blurb: "Overlay text on every page.",
    category: "edit",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Set position, opacity, and rotation.",
    accent: "#9B59B6",
  },
  {
    id: "page-numbers",
    title: "Page numbers",
    blurb: "Number every page.",
    category: "edit",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Pick a corner or edge.",
    accent: "#E67E22",
  },
  {
    id: "crop-pdf",
    title: "Crop PDF",
    blurb: "Keep only the area you select.",
    category: "edit",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Drag on the preview to crop.",
    accent: "#E67E22",
  },
  {
    id: "rotate-pdf",
    title: "Rotate PDF",
    blurb: "Turn pages left or right.",
    category: "edit",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "All pages, or one page at a time.",
    accent: "#2980B9",
  },
  {
    id: "sign-pdf",
    title: "Sign PDF",
    blurb: "Add a typed signature.",
    category: "security",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Places your name on the last page.",
    accent: "#8E44AD",
    needsText: true,
  },
  {
    id: "unlock-pdf",
    title: "Unlock PDF",
    blurb: "Remove a known password.",
    category: "security",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Requires the current password.",
    accent: "#27AE60",
    needsPassword: true,
  },
  {
    id: "protect-pdf",
    title: "Protect PDF",
    blurb: "Encrypt with a password.",
    category: "security",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "AES encryption in your browser.",
    accent: "#2C3E50",
    needsPassword: true,
  },
  {
    id: "redact-pdf",
    title: "Redact PDF",
    blurb: "Black out text and images.",
    category: "security",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Drag boxes to cover sensitive areas.",
    accent: "#1A1A1A",
  },
  {
    id: "ocr-pdf",
    title: "OCR PDF",
    blurb: "Make scans searchable.",
    category: "smart",
    accept: "application/pdf,.pdf",
    multiple: false,
    output: "PDF",
    hint: "Runs entirely on your device.",
    accent: "#E74C3C",
    badge: "Local",
  },
  {
    id: "compare-pdf",
    title: "Compare PDF",
    blurb: "View two PDFs side by side.",
    category: "smart",
    accept: "application/pdf,.pdf",
    multiple: true,
    output: "VIEW",
    hint: "Pick exactly two files.",
    accent: "#3498DB",
    needsCompare: true,
  },
];

export function getTool(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}
