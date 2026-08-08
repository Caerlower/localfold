"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  DownloadSimple,
  Eraser,
  MagnifyingGlass,
  SpinnerGap,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { RedactPdfPage } from "./RedactPdfPage";
import { loadPdfJs, findTextRects, renderPageToCanvas } from "@/lib/convert/pdfjs";
import { redactPdf, type RedactRegion } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";
import {
  clampCropRect,
  type CropRectNorm,
  type RedactMark,
  type StudioStatus,
} from "@/lib/pdfStudio";
import {
  ToolCard,
  ToolDropzone,
  ToolHeader,
  ToolPageShell,
} from "@/components/ToolPageShell";

function newId() {
  return crypto.randomUUID();
}

export function RedactStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [thumbs, setThumbs] = useState<{ url: string; w: number; h: number }[]>(
    [],
  );
  const [status, setStatus] = useState<StudioStatus>("idle");
  const [message, setMessage] = useState("");
  const [marks, setMarks] = useState<RedactMark[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const resetState = (opts?: { keepMessage?: boolean }) => {
    setThumbs((prev) => {
      prev.forEach((t) => URL.revokeObjectURL(t.url));
      return [];
    });
    setDoc((prev) => {
      try {
        prev?.cleanup();
      } catch {
        /* ignore */
      }
      return null;
    });
    setFile(null);
    setMarks([]);
    setSelectedId(null);
    setSearch("");
    setStatus("idle");
    if (!opts?.keepMessage) setMessage("");
  };

  const loadFile = async (next: File) => {
    if (!/\.pdf$/i.test(next.name) && next.type !== "application/pdf") {
      setStatus("error");
      setMessage("Please choose a PDF file.");
      return;
    }
    setThumbs((prev) => {
      prev.forEach((t) => URL.revokeObjectURL(t.url));
      return [];
    });
    setDoc((prev) => {
      try {
        prev?.cleanup();
      } catch {
        /* ignore */
      }
      return null;
    });
    setMarks([]);
    setSelectedId(null);
    setStatus("loading");
    setMessage("Opening PDF…");
    setFile(next);
    try {
      const pdf = await loadPdfJs(new Uint8Array(await next.arrayBuffer()));
      setDoc(pdf);
      const nextThumbs: { url: string; w: number; h: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i += 1) {
        setMessage(`Preview ${i} of ${pdf.numPages}…`);
        const { canvas, viewport, scale } = await renderPageToCanvas(
          pdf,
          i,
          0.7,
        );
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Thumb failed"))),
            "image/jpeg",
            0.72,
          );
        });
        nextThumbs.push({
          url: URL.createObjectURL(blob),
          w: viewport.width / scale,
          h: viewport.height / scale,
        });
      }
      setThumbs(nextThumbs);
      setStatus("idle");
      setMessage(
        `${pdf.numPages} pages · click text to mark, or drag to multi-select`,
      );
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not open this PDF.");
      setFile(null);
      setDoc(null);
    }
  };

  useEffect(
    () => () => {
      setThumbs((prev) => {
        prev.forEach((t) => URL.revokeObjectURL(t.url));
        return [];
      });
    },
    [],
  );

  const marksByPage = useMemo(() => {
    const map = new Map<number, RedactMark[]>();
    for (const m of marks) {
      const list = map.get(m.pageIndex) || [];
      list.push(m);
      map.set(m.pageIndex, list);
    }
    return map;
  }, [marks]);

  const scrollToPage = (index: number) => {
    pageRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const toggleSpan = (
    pageIndex: number,
    rect: CropRectNorm,
    label: string,
    key: string,
  ) => {
    setMarks((prev) => {
      const existing = prev.find((m) => m.textId === key);
      if (existing) {
        setSelectedId(null);
        return prev.filter((m) => m.id !== existing.id);
      }
      const id = newId();
      setSelectedId(id);
      return [
        ...prev,
        {
          id,
          pageIndex,
          ...rect,
          label: label.slice(0, 64),
          source: "text",
          textId: key,
        },
      ];
    });
  };

  const addDrawMark = (pageIndex: number, rect: CropRectNorm) => {
    const id = newId();
    setMarks((prev) => [
      ...prev,
      {
        id,
        pageIndex,
        ...rect,
        label: `Area on page ${pageIndex + 1}`,
        source: "draw",
      },
    ]);
    setSelectedId(id);
  };

  const removeMark = (id: string) => {
    setMarks((prev) => prev.filter((m) => m.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const clearAll = () => {
    setMarks([]);
    setSelectedId(null);
  };

  const runSearch = async () => {
    if (!file || !thumbs.length) return;
    const phrase = search.trim();
    if (!phrase) {
      setStatus("error");
      setMessage("Enter text to search.");
      return;
    }
    setSearching(true);
    setMessage(`Searching for “${phrase}”…`);
    try {
      const hits = await findTextRects(file, phrase);
      if (!hits.length) {
        setStatus("error");
        setMessage(`No matches for “${phrase}”.`);
        return;
      }
      const added: RedactMark[] = [];
      for (const hit of hits) {
        const page = thumbs[hit.pageIndex];
        if (!page) continue;
        const rect = clampCropRect({
          x: hit.x / page.w,
          y: 1 - (hit.y + hit.h) / page.h,
          w: hit.w / page.w,
          h: hit.h / page.h,
        });
        added.push({
          id: newId(),
          pageIndex: hit.pageIndex,
          ...rect,
          label: phrase,
          source: "search",
        });
      }
      setMarks((prev) => [...prev, ...added]);
      setSelectedId(added[0]?.id ?? null);
      setStatus("idle");
      setMessage(
        `Marked ${added.length} match${added.length === 1 ? "" : "es"} for “${phrase}”.`,
      );
      if (added[0]) scrollToPage(added[0].pageIndex);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const run = async () => {
    if (!file) return;
    if (!marks.length) {
      setStatus("error");
      setMessage("Drag a box over what you want to redact.");
      return;
    }
    setStatus("working");
    setMessage("Redacting…");
    try {
      const regions: RedactRegion[] = marks.map(
        ({ pageIndex, x, y, w, h }) => ({ pageIndex, x, y, w, h }),
      );
      const bytes = await redactPdf(file, { regions });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(file.name)}-redacted.pdf`;
      downloadBlob(blob, name);
      setStatus("done");
      setMessage(
        `Downloaded ${name} · ${formatBytes(blob.size)} · ${marks.length} area${
          marks.length === 1 ? "" : "s"
        } redacted`,
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Redact failed.");
    }
  };

  if (!file) {
    return (
      <ToolPageShell
        relatedIds={["protect-pdf", "unlock-pdf", "edit-pdf", "compress-pdf"]}
      >
        <ToolCard>
          <ToolHeader
            title="Redact PDF"
            blurb="Cover logos, images, or text"
            accent="#1A1A1A"
            Icon={Eraser}
          />
          <RedactDropzone
            onFile={(f) => void loadFile(f)}
            status={status}
            message={message}
          />
        </ToolCard>
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell width="full">
      <ToolHeader
        title="Redact PDF"
        blurb="Cover logos, images, or text"
        accent="#1A1A1A"
        Icon={Eraser}
        size="compact"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="max-w-[240px] truncate rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink">
              {file.name}
            </span>
            <button
              type="button"
              onClick={() => resetState()}
              className="pressable rounded-full border border-line bg-paper px-3 py-1.5 text-ink-soft transition-colors hover:text-[var(--danger)]"
            >
              Clear
            </button>
          </div>
        }
      />

      {status === "loading" || !doc ? (
        <div className="mt-4 flex min-h-[420px] flex-col items-center justify-center gap-3 text-ink-soft">
          <SpinnerGap className="h-8 w-8 animate-spin text-moss" />
          <p className="text-sm">{message || "Loading pages…"}</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[88px_1fr_300px]">
          <aside className="hidden max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-line bg-paper p-2 lg:sticky lg:top-[calc(var(--nav-clearance)+0.75rem)] lg:block">
            <ul className="space-y-2">
              {thumbs.map((t, i) => (
                <li key={t.url}>
                  <button
                    type="button"
                    onClick={() => scrollToPage(i)}
                    className="block w-full overflow-hidden rounded-lg border border-line bg-mist p-1 hover:border-moss"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.url}
                      alt={`Page ${i + 1}`}
                      className="aspect-[3/4] w-full object-contain"
                    />
                    <span className="mt-0.5 block text-center text-[10px] font-semibold text-ink-soft">
                      {i + 1}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-[24px] border border-line bg-[#e8eceb] p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c0392b] px-3 py-1.5 text-xs font-semibold text-white">
                <Eraser className="h-3.5 w-3.5" weight="bold" />
                Redact
              </span>
              <span className="text-xs text-ink-soft">
                Drag a box to cover · click words for text
              </span>
            </div>

            <div className="mx-auto flex w-full max-w-[860px] flex-col gap-10">
              {thumbs.map((_, index) => (
                <div
                  key={`page-${index}`}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  className="scroll-mt-4"
                >
                  <p className="mb-2 text-center text-xs font-semibold text-ink-soft">
                    Page {index + 1}
                  </p>
                  <RedactPdfPage
                    doc={doc}
                    pageNumber={index + 1}
                    marks={marksByPage.get(index) || []}
                    selectedId={selectedId}
                    onToggleSpan={(rect, label, key) =>
                      toggleSpan(index, rect, label, key)
                    }
                    onSelectMark={setSelectedId}
                    onRemoveMark={removeMark}
                    onDraw={(rect) => addDrawMark(index, rect)}
                  />
                </div>
              ))}
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-line bg-paper p-5 shadow-[var(--shadow)] sm:rounded-[20px] lg:sticky lg:top-[calc(var(--nav-clearance)+0.75rem)]">
            <label className="block text-sm">
              <span className="font-semibold text-ink">Search text</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                  placeholder="Find and mark…"
                  className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-moss"
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching}
                  className="inline-flex items-center justify-center rounded-xl border border-line px-3 text-ink hover:bg-mist disabled:opacity-50"
                  aria-label="Search"
                >
                  {searching ? (
                    <SpinnerGap className="h-4 w-4 animate-spin" />
                  ) : (
                    <MagnifyingGlass className="h-4 w-4" weight="bold" />
                  )}
                </button>
              </div>
            </label>

            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">
                Marked for redaction
              </h2>
              {marks.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-semibold text-[var(--danger)] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="mt-3 max-h-[280px] space-y-3 overflow-y-auto pr-1">
              {marks.length === 0 ? (
                <p className="rounded-xl bg-mist px-3 py-3 text-xs leading-relaxed text-ink-soft">
                  No areas yet. Drag a box over the logo/image/text you want
                  blacked out — works on anything, not just selectable text.
                </p>
              ) : (
                Array.from(marksByPage.entries()).map(([pageIndex, list]) => (
                  <div key={pageIndex}>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                      Page {pageIndex + 1}
                    </p>
                    <ul className="space-y-1.5">
                      {list.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(m.id);
                              scrollToPage(m.pageIndex);
                            }}
                            className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition ${
                              selectedId === m.id
                                ? "border-[#2B7DE9] bg-[#e8f1fc]"
                                : "border-line bg-paper hover:bg-mist"
                            }`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2B7DE9] text-[10px] font-bold text-white">
                              {m.source === "draw" ? "▢" : "T"}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-ink">
                              {m.label}
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeMark(m.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  removeMark(m.id);
                                }
                              }}
                              className="rounded p-1 text-ink-soft hover:bg-red-50 hover:text-[var(--danger)]"
                              aria-label="Remove mark"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex gap-2 rounded-xl bg-[#fff6e8] px-3 py-2.5 text-xs leading-relaxed text-[#8a5a10]">
              <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
              Review carefully. Redaction paints black boxes in this browser —
              your file never uploads.
            </div>

            <button
              type="button"
              onClick={() => void run()}
              disabled={!marks.length || status === "working"}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#c0392b] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#a93226] disabled:opacity-45"
            >
              {status === "working" ? (
                <>
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                <>
                  <DownloadSimple className="h-4 w-4" weight="bold" />
                  Redact
                </>
              )}
            </button>

            {message && (
              <p
                className={`mt-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                  status === "error"
                    ? "bg-red-50 text-[var(--danger)]"
                    : status === "done"
                      ? "bg-moss-soft text-moss-deep"
                      : "bg-mist text-ink-soft"
                }`}
              >
                {message}
              </p>
            )}
          </aside>
        </div>
      )}
    </ToolPageShell>
  );
}

function RedactDropzone({
  onFile,
  status,
  message,
}: {
  onFile: (file: File) => void;
  status: string;
  message: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <>
      <ToolDropzone
        label="Select PDF"
        dragOver={dragOver}
        onDragOver={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDrop={(files) => {
          const f = files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </ToolDropzone>
      {message && (
        <p
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status === "error"
              ? "bg-red-50 text-[var(--danger)]"
              : "bg-mist text-ink-soft"
          }`}
        >
          {message}
        </p>
      )}
    </>
  );
}
