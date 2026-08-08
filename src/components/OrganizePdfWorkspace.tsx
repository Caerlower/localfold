"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowsDownUp,
  DownloadSimple,
  SpinnerGap,
  Trash,
  Files,
  Plus,
} from "@phosphor-icons/react";
import { loadPdfJs, renderPageToCanvas } from "@/lib/convert/pdfjs";
import { organizePdf } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";
import {
  ToolCard,
  ToolDropzone,
  ToolHeader,
  ToolPageShell,
} from "@/components/ToolPageShell";

type PageItem = {
  id: string;
  sourceIndex: number;
  thumbUrl: string;
};

type Status = "idle" | "loading" | "working" | "done" | "error";

export function OrganizePdfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    pages.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
    setFile(null);
    setPages([]);
    setStatus("idle");
    setMessage("");
    setDragId(null);
    setOverId(null);
  };

  const loadFile = useCallback(async (next: File) => {
    if (!/\.pdf$/i.test(next.name) && next.type !== "application/pdf") {
      setStatus("error");
      setMessage("Please choose a PDF file.");
      return;
    }

    setStatus("loading");
    setMessage("Rendering page previews…");
    setFile(next);
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
      return [];
    });

    try {
      const doc = await loadPdfJs(new Uint8Array(await next.arrayBuffer()));
      const items: PageItem[] = [];

      for (let i = 1; i <= doc.numPages; i += 1) {
        setMessage(`Rendering page ${i} of ${doc.numPages}…`);
        const { canvas } = await renderPageToCanvas(doc, i, 1.15);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Preview failed"))),
            "image/jpeg",
            0.88,
          );
        });
        items.push({
          id: `p-${i}-${crypto.randomUUID()}`,
          sourceIndex: i - 1,
          thumbUrl: URL.createObjectURL(blob),
        });
      }

      doc.cleanup();
      setPages(items);
      setStatus("idle");
      setMessage(
        `${items.length} pages ready — drag to reorder, remove what you don’t need.`,
      );
    } catch (err) {
      console.error(err);
      setFile(null);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not open this PDF.");
    }
  }, []);

  const onDropFile = (list: FileList | null) => {
    const f = list?.[0];
    if (f) void loadFile(f);
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.thumbUrl);
      return prev.filter((p) => p.id !== id);
    });
    setStatus("idle");
    setMessage("");
  };

  const reversePages = () => {
    setPages((prev) => [...prev].reverse());
  };

  const movePage = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === fromId);
      const to = prev.findIndex((p) => p.id === toId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const download = async () => {
    if (!file || !pages.length) {
      setStatus("error");
      setMessage("Add a PDF and keep at least one page.");
      return;
    }
    setStatus("working");
    setMessage("Building organized PDF…");
    try {
      const bytes = await organizePdf(file, {
        pageOrder: pages.map((p) => p.sourceIndex),
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(file.name)}-organized.pdf`;
      downloadBlob(blob, name);
      setStatus("done");
      setMessage(`Downloaded ${name} · ${formatBytes(blob.size)} · ${pages.length} pages`);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Organize failed.");
    }
  };

  if (!file) {
    return (
      <ToolPageShell
        relatedIds={["merge-pdf", "split-pdf", "rotate-pdf", "compress-pdf"]}
      >
        <ToolCard>
          <ToolHeader
            title="Organize PDF"
            blurb="Drag to reorder · × to remove"
            accent="#8E44AD"
            Icon={Files}
          />
          <ToolDropzone
            label="Select PDF"
            dragOver={dragOver}
            onDragOver={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropFile}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                onDropFile(e.target.files);
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
        </ToolCard>
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell width="wide">
      <ToolHeader
        title="Organize PDF"
        blurb="Drag to reorder · × to remove"
        accent="#8E44AD"
        Icon={Files}
        size="compact"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="max-w-[220px] truncate rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink">
              {file.name}
            </span>
            <span className="text-ink-soft">{formatBytes(file.size)}</span>
            <button
              type="button"
              onClick={clear}
              className="pressable rounded-full border border-line bg-paper px-3 py-1.5 text-ink-soft transition-colors hover:text-[var(--danger)]"
            >
              Clear
            </button>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-[1fr_300px]">
          <section className="rounded-2xl border border-line bg-[#eef1f0] p-4 sm:rounded-[20px] sm:p-5">
            {status === "loading" ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-ink-soft">
                <SpinnerGap className="h-8 w-8 animate-spin text-moss" />
                <p className="text-sm">{message || "Loading pages…"}</p>
              </div>
            ) : pages.length === 0 ? (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-ink-soft">
                All pages removed. Upload again or keep at least one page.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {pages.map((page, index) => (
                  <li
                    key={page.id}
                    draggable
                    onDragStart={() => setDragId(page.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverId(page.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) movePage(dragId, page.id);
                      setDragId(null);
                      setOverId(null);
                    }}
                    className={`group relative flex cursor-grab flex-col rounded-2xl bg-paper p-3 shadow-[var(--shadow-sm)] transition active:cursor-grabbing ${
                      overId === page.id && dragId !== page.id
                        ? "ring-2 ring-moss"
                        : ""
                    } ${dragId === page.id ? "opacity-50" : ""}`}
                  >
                    <button
                      type="button"
                      aria-label={`Remove page ${index + 1}`}
                      onClick={() => removePage(page.id)}
                      className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper opacity-90 shadow transition hover:bg-[var(--danger)]"
                    >
                      <Trash className="h-4 w-4" weight="bold" />
                    </button>
                    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-mist">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.thumbUrl}
                        alt={`Page ${index + 1}`}
                        className="max-h-full max-w-full object-contain"
                        draggable={false}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold text-ink-soft">
                      <span>Page {index + 1}</span>
                      <span className="rounded-full bg-mist px-2 py-0.5">
                        #{page.sourceIndex + 1}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="h-fit rounded-2xl border border-line bg-paper p-5 shadow-[var(--shadow)] sm:rounded-[20px] lg:sticky lg:top-[calc(var(--nav-clearance)+0.75rem)]">
            <h2 className="text-lg font-semibold text-ink">Organize options</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Drag to reorder. Remove pages you don’t need.
              Download when the sequence looks right.
            </p>

            <dl className="mt-5 space-y-2 rounded-2xl bg-mist/70 px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Pages kept</dt>
                <dd className="font-semibold text-ink">{pages.length}</dd>
              </div>
              {file && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Original size</dt>
                  <dd className="font-semibold text-ink">
                    {formatBytes(file.size)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={reversePages}
                disabled={pages.length < 2 || status === "working"}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-40"
              >
                <ArrowsDownUp className="h-4 w-4" />
                Reverse order
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:bg-mist"
              >
                <Plus className="h-4 w-4" weight="bold" />
                Replace file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  onDropFile(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <button
              type="button"
              onClick={download}
              disabled={!pages.length || status === "working" || status === "loading"}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-moss px-5 py-3.5 text-sm font-semibold text-paper transition hover:bg-moss-deep disabled:opacity-45"
            >
              {status === "working" ? (
                <>
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                <>
                  <DownloadSimple className="h-4 w-4" weight="bold" />
                  Organize PDF
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
    </ToolPageShell>
  );
}
