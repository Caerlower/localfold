"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  Crop,
  DownloadSimple,
  SpinnerGap,
} from "@phosphor-icons/react";
import { CropBoxOverlay } from "./CropBoxOverlay";
import { usePdfPages } from "@/hooks/usePdfPages";
import { cropPdf } from "@/lib/convert/pdfOps";
import { basename, downloadBlob, formatBytes } from "@/lib/format";
import {
  DEFAULT_CROP,
  FULL_PAGE_CROP,
  clampCropRect,
  type CropRectNorm,
} from "@/lib/pdfStudio";
import {
  ToolCard,
  ToolDropzone,
  ToolHeader,
  ToolPageShell,
} from "@/components/ToolPageShell";

type Scope = "all" | "current";

export function CropStudio() {
  const studio = usePdfPages();
  const [current, setCurrent] = useState(0);
  const [scope, setScope] = useState<Scope>("all");
  const [sharedRect, setSharedRect] = useState<CropRectNorm>(DEFAULT_CROP);
  const [perPage, setPerPage] = useState<Record<number, CropRectNorm>>({});

  // Reset crop state when a new file loads
  useEffect(() => {
    setCurrent(0);
    setSharedRect(DEFAULT_CROP);
    setPerPage({});
    setScope("all");
  }, [studio.file]);

  const page = studio.pages[current] ?? null;

  const activeRect = useMemo(() => {
    if (scope === "all") return sharedRect;
    return perPage[current] ?? DEFAULT_CROP;
  }, [scope, sharedRect, perPage, current]);

  const setActiveRect = (next: CropRectNorm) => {
    const clamped = clampCropRect(next);
    if (scope === "all") {
      setSharedRect(clamped);
    } else {
      setPerPage((prev) => ({ ...prev, [current]: clamped }));
    }
  };

  const reset = () => {
    if (scope === "all") {
      setSharedRect(FULL_PAGE_CROP);
    } else {
      setPerPage((prev) => {
        const copy = { ...prev };
        delete copy[current];
        return copy;
      });
    }
  };

  const run = async () => {
    if (!studio.file || !page) return;
    studio.setStatus("working");
    studio.setMessage("Cropping PDF…");
    try {
      const bytes = await cropPdf(studio.file, {
        rect: activeRect,
        scope,
        pageIndex: page.sourceIndex,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const name = `${basename(studio.file.name)}-cropped.pdf`;
      downloadBlob(blob, name);
      studio.setStatus("done");
      studio.setMessage(`Downloaded ${name} · ${formatBytes(blob.size)}`);
    } catch (err) {
      studio.setStatus("error");
      studio.setMessage(err instanceof Error ? err.message : "Crop failed.");
    }
  };

  if (!studio.file) {
    return (
      <ToolPageShell
        relatedIds={["rotate-pdf", "organize-pdf", "compress-pdf", "split-pdf"]}
      >
        <ToolCard>
          <ToolHeader
            title="Crop PDF"
            blurb="Drag to keep the area you want"
            accent="#E67E22"
            Icon={Crop}
          />
          <CropDropzone
            onFile={(f) => void studio.loadFile(f)}
            status={studio.status}
            message={studio.message}
          />
        </ToolCard>
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell width="wide">
      <ToolHeader
        title="Crop PDF"
        blurb="Drag to keep the area you want"
        accent="#E67E22"
        Icon={Crop}
        size="compact"
        aside={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="max-w-[240px] truncate rounded-full border border-line bg-paper px-3 py-1.5 font-medium text-ink">
              {studio.file.name}
            </span>
            <span className="text-ink-soft">
              {formatBytes(studio.file.size)}
            </span>
            <button
              type="button"
              onClick={studio.clear}
              className="pressable rounded-full border border-line bg-paper px-3 py-1.5 text-ink-soft transition-colors hover:text-[var(--danger)]"
            >
              Clear
            </button>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-[1fr_300px]">
          <section className="flex flex-col rounded-2xl border border-line bg-[#e8eceb] p-4 sm:rounded-[20px] sm:p-5">
            {studio.status === "loading" ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-ink-soft">
                <SpinnerGap className="h-8 w-8 animate-spin text-moss" />
                <p className="text-sm">{studio.message || "Loading pages…"}</p>
              </div>
            ) : (
              <>
                {/* Focus preview */}
                <div className="relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#dfe5e3] p-6">
                  {page && (
                    <div
                      data-crop-stage
                      className="relative isolate max-h-[min(68vh,720px)] max-w-full overflow-hidden rounded-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.thumbUrl}
                        alt={`Page ${current + 1}`}
                        className="block max-h-[min(68vh,720px)] max-w-full select-none object-contain shadow-lg"
                        draggable={false}
                      />
                      <CropBoxOverlay
                        rect={activeRect}
                        onChange={setActiveRect}
                        accent="#2B7DE9"
                      />
                    </div>
                  )}

                  {/* Floating page nav */}
                  {studio.pages.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/90 px-3 py-2 text-sm text-paper shadow-lg">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={current <= 0}
                        onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                        className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30"
                      >
                        <CaretLeft className="h-4 w-4" weight="bold" />
                      </button>
                      <span className="min-w-[4.5rem] text-center font-medium tabular-nums">
                        {current + 1} / {studio.pages.length}
                      </span>
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={current >= studio.pages.length - 1}
                        onClick={() =>
                          setCurrent((c) =>
                            Math.min(studio.pages.length - 1, c + 1),
                          )
                        }
                        className="rounded-full p-1 hover:bg-white/10 disabled:opacity-30"
                      >
                        <CaretRight className="h-4 w-4" weight="bold" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Thumbnail strip */}
                {studio.pages.length > 1 && (
                  <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {studio.pages.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setCurrent(i)}
                          className={`block w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-paper p-1 transition ${
                            i === current
                              ? "border-moss shadow"
                              : "border-transparent opacity-80 hover:opacity-100"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.thumbUrl}
                            alt=""
                            className="aspect-[3/4] w-full object-contain"
                          />
                          <span className="mt-0.5 block text-center text-[10px] font-semibold text-ink-soft">
                            {i + 1}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <aside className="h-fit rounded-2xl border border-line bg-paper p-5 shadow-[var(--shadow)] sm:rounded-[20px] lg:sticky lg:top-[calc(var(--nav-clearance)+0.75rem)]">
            <h2 className="text-lg font-semibold text-ink">Crop PDF</h2>
            <div className="mt-3 rounded-xl bg-[#e8f1fc] px-3.5 py-3 text-sm leading-relaxed text-[#1a4a7a]">
              Click and drag to select the area you want to keep. Resize with
              the handles if needed.
            </div>

            <button
              type="button"
              onClick={reset}
              className="mt-4 text-sm font-semibold text-[var(--danger)] hover:underline"
            >
              Reset {scope === "all" ? "all" : "this page"}
            </button>

            <fieldset className="mt-5 space-y-2.5">
              <legend className="text-sm font-semibold text-ink">Pages</legend>
              {(
                [
                  ["all", "All pages"],
                  ["current", "Current page"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-ink"
                >
                  <input
                    type="radio"
                    name="crop-scope"
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="accent-[var(--moss)]"
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              {scope === "all"
                ? "The same crop area is applied to every page."
                : `Only page ${current + 1} will be cropped. Other pages stay full size.`}
            </p>

            <button
              type="button"
              onClick={() => void run()}
              disabled={
                studio.status === "working" ||
                studio.status === "loading" ||
                !studio.pages.length
              }
              className="pressable mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-moss px-5 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-moss-deep disabled:opacity-45"
            >
              {studio.status === "working" ? (
                <>
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                <>
                  <DownloadSimple className="h-4 w-4" weight="bold" />
                  Crop PDF
                </>
              )}
            </button>

            {studio.message && studio.status !== "loading" && (
              <p
                className={`mt-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                  studio.status === "error"
                    ? "bg-red-50 text-[var(--danger)]"
                    : studio.status === "done"
                      ? "bg-moss-soft text-moss-deep"
                      : "bg-mist text-ink-soft"
                }`}
              >
                {studio.message}
              </p>
            )}
          </aside>
      </div>
    </ToolPageShell>
  );
}

function CropDropzone({
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
