# LocalFold

**Private PDF tools that run entirely in your browser.**

Merge, split, compress, convert, redact, OCR, and more — without uploading files to a server. Processing happens on-device. Closing the tab clears your documents from memory.

[Privacy](/privacy) · No accounts · No uploads

---

## Features

| Category | Tools |
| --- | --- |
| **Organize** | Merge, Split, Organize, Rotate |
| **Optimize** | Compress, Repair |
| **To PDF** | Word, PowerPoint, Excel, Images, HTML, Markdown |
| **From PDF** | Word, PowerPoint, Excel, JPG/PNG, Markdown |
| **Edit** | Watermark, Page numbers, Crop, Edit text stamp |
| **Security** | Protect, Unlock, Redact |
| **Smart** | OCR, Compare, Scan to PDF |

All tools execute client-side using Web APIs, `pdf.js`, `pdf-lib`, Tesseract.js, and related libraries.

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm start       # serve production build
npm run lint    # eslint
```

`postinstall` applies a required patch to `pptx-browser` via [patch-package](https://github.com/ds300/patch-package). Do not remove `patches/`.

---

## Deploy (Vercel)

1. Push this repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new) (Next.js is detected automatically)
3. Optional: set `NEXT_PUBLIC_SITE_URL` to your production URL (sitemap + Open Graph)

See [`.env.example`](.env.example). No other environment variables are required — there is no backend API for document processing.

---

## Architecture

```
src/
  app/                 # Next.js App Router pages
  components/          # UI: home, tool shell, studios
  hooks/               # Shared React hooks (PDF pages)
  lib/
    tools.ts           # Tool registry + copy
    runTool.ts         # Client tool orchestration
    convert/           # Format converters & PDF ops
    pdfStudio.ts       # Studio helpers
  types/               # Ambient typings
public/
  pdf.worker.min.mjs   # pdf.js worker
  tessdata/            # Tesseract OCR language data (local)
patches/               # patch-package fixes (pptx-browser)
```

- **UI:** Next.js 16, React 19, Tailwind CSS 4
- **PDF:** pdf.js + `@cantoo/pdf-lib`
- **OCR:** tesseract.js with bundled `public/tessdata`
- **Office:** docx / pptxgenjs / pptx-browser / exceljs / xlsx

Security headers (CSP, frame denial, etc.) are set in `next.config.ts`.

---

## Privacy

LocalFold is designed so document bytes never need to leave the browser tab for core tools. Hosting may still log normal page requests (IP, etc.). Details: `/privacy` in the app.

---

## Development notes

- Tool pages live at `/tool/[id]` — IDs come from `src/lib/tools.ts`.
- Interactive studios (rotate, crop, redact, split, …) are routed via `src/components/studio/StudioRouter.tsx`.
- Optional smoke test (Playwright): `node scripts/test-pdf-to-word.mjs` (writes under `.tmp-test/`, gitignored).

---

## License

Private project — all rights reserved unless otherwise stated.
