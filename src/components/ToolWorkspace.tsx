"use client";

import { useCallback, useRef, useState } from "react";
import {
  DownloadSimple,
  SpinnerGap,
  Trash,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";
import { TOOLS, type ToolDef, type ToolId } from "@/lib/tools";
import { TOOL_ICONS } from "./ToolIcons";
import { downloadBlob, formatBytes } from "@/lib/format";
import { runTool } from "@/lib/runTool";
import { CompareView } from "./CompareView";
import { ScanCapture } from "./ScanCapture";
import { getStudioForTool, isStudioTool } from "./studio/StudioRouter";
import {
  ToolCard,
  ToolDropzone,
  ToolHeader,
  ToolPageShell,
} from "./ToolPageShell";

function relatedFor(tool: ToolDef): ToolId[] {
  const same = TOOLS.filter(
    (t) => t.category === tool.category && t.id !== tool.id,
  ).map((t) => t.id);
  if (same.length >= 4) return same.slice(0, 4);
  const rest = TOOLS.filter(
    (t) => t.id !== tool.id && !same.includes(t.id),
  ).map((t) => t.id);
  return [...same, ...rest].slice(0, 4);
}

type Status = "idle" | "working" | "done" | "error";

export function ToolWorkspace({ tool }: { tool: ToolDef }) {
  if (isStudioTool(tool.id)) {
    return <>{getStudioForTool(tool.id)}</>;
  }
  return <GenericToolWorkspace tool={tool} />;
}

function GenericToolWorkspace({ tool }: { tool: ToolDef }) {
  const Icon = TOOL_ICONS[tool.id];
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [cropMargin, setCropMargin] = useState(36);
  const [fidelity, setFidelity] = useState<"visual" | "editable">("visual");
  const [targetSize, setTargetSize] = useState<string>("500");
  const [targetUnit, setTargetUnit] = useState<"KB" | "MB">("KB");
  const [imageFormat, setImageFormat] = useState<"png" | "jpeg">("png");
  const [imagePack, setImagePack] = useState<"zip" | "files">("files");
  const [compareReady, setCompareReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (!incoming.length) return;
      setFiles((prev) => {
        if (tool.needsCompare) {
          return [...prev, ...incoming].slice(0, 2);
        }
        return tool.multiple ? [...prev, ...incoming] : [incoming[0]];
      });
      setStatus("idle");
      setMessage("");
      setCompareReady(false);

      // Suggest ~50% of original size for compress
      if (tool.id === "compress-pdf") {
        const half = Math.max(1024, Math.floor(incoming[0].size * 0.5));
        if (half >= 1024 * 1024) {
          setTargetUnit("MB");
          setTargetSize(String(Math.round((half / (1024 * 1024)) * 10) / 10));
        } else {
          setTargetUnit("KB");
          setTargetSize(String(Math.max(1, Math.round(half / 1024))));
        }
      }
    },
    [tool.multiple, tool.needsCompare, tool.id],
  );

  const run = async () => {
    if (tool.needsCompare) {
      if (files.length !== 2) {
        setStatus("error");
        setMessage("Add exactly two PDFs to compare.");
        return;
      }
      setCompareReady(true);
      setStatus("done");
      setMessage("Side-by-side viewer ready below.");
      return;
    }

    if (!files.length && !tool.needsScan) {
      setStatus("error");
      setMessage("Add a file first.");
      return;
    }

    if (tool.id === "compress-pdf") {
      const n = Number(targetSize);
      if (!Number.isFinite(n) || n <= 0) {
        setStatus("error");
        setMessage("Enter a target size greater than 0.");
        return;
      }
    }

    setStatus("working");
    setMessage("Working entirely in your browser…");

    try {
      let lastNote = "";
      const result = await runTool(tool.id, files, {
        password,
        text,
        cropMargin,
        fidelity,
        targetSize: Number(targetSize),
        targetUnit,
        imageFormat,
        imagePack,
        onProgress: (msg) => {
          lastNote = msg;
          setMessage(msg);
        },
      });

      if (result.files && result.files.length > 1) {
        // Stagger downloads — browsers often block simultaneous multi-file saves
        for (let i = 0; i < result.files.length; i += 1) {
          const item = result.files[i];
          setMessage(
            `Downloading ${i + 1} of ${result.files.length}: ${item.filename}…`,
          );
          downloadBlob(item.blob, item.filename);
          if (i < result.files.length - 1) {
            await new Promise((r) => setTimeout(r, 350));
          }
        }
        setStatus("done");
        setMessage(
          `Downloaded ${result.files.length} images · ${formatBytes(
            result.files.reduce((n, f) => n + f.blob.size, 0),
          )}`,
        );
      } else {
        downloadBlob(result.blob, result.filename);
        setStatus("done");
        setMessage(
          lastNote && tool.id === "compress-pdf"
            ? `${lastNote} · saved as ${result.filename}`
            : `Downloaded ${result.filename} · ${formatBytes(result.blob.size)}`,
        );
      }
    } catch (err) {
      console.error("[LocalFold]", tool.id, err);
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong while converting.",
      );
    }
  };

  return (
    <ToolPageShell relatedIds={relatedFor(tool)}>
      <ToolCard>
        <ToolHeader
          title={tool.title}
          blurb={tool.hint}
          accent={tool.accent}
          Icon={Icon}
        />

        {tool.needsScan && (
          <div className="mt-6">
            <ScanCapture onCapture={(file) => addFiles([file])} />
          </div>
        )}

        <ToolDropzone
          label={
            tool.needsCompare
              ? "Drop two PDFs"
              : tool.category === "to-pdf" || tool.needsScan
                ? "Select file"
                : "Select PDF"
          }
          dragOver={dragOver}
          onDragOver={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onDrop={(files) => {
            if (files?.length) addFiles(files);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={tool.accept}
            multiple={tool.multiple || tool.needsCompare}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </ToolDropzone>

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mist text-xs font-bold text-ink-soft">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-ink-soft">{formatBytes(file.size)}</p>
                </div>
                {tool.multiple && (
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-ink-soft hover:bg-mist"
                      onClick={() =>
                        setFiles((prev) => {
                          if (index === 0) return prev;
                          const next = [...prev];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          return next;
                        })
                      }
                    >
                      <CaretUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-ink-soft hover:bg-mist"
                      onClick={() =>
                        setFiles((prev) => {
                          if (index >= prev.length - 1) return prev;
                          const next = [...prev];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          return next;
                        })
                      }
                    >
                      <CaretDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-ink-soft hover:bg-mist hover:text-[var(--danger)]"
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {(tool.needsPassword ||
          tool.needsText ||
          tool.id === "crop-pdf" ||
          tool.id === "pdf-to-word" ||
          tool.id === "pdf-to-images" ||
          tool.id === "compress-pdf") && (
          <div className="mt-5 space-y-3 rounded-2xl border border-line bg-mist/50 p-4">
            {tool.id === "pdf-to-images" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-ink">Image format</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["png", "PNG · lossless"],
                        ["jpeg", "JPG · smaller"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setImageFormat(value)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                          imageFormat === value
                            ? "border-moss bg-moss text-paper"
                            : "border-line bg-paper text-ink-soft hover:border-moss/30 hover:text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Download as</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["files", "Image files"],
                        ["zip", "ZIP archive"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setImagePack(value)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                          imagePack === value
                            ? "border-moss bg-moss text-paper"
                            : "border-line bg-paper text-ink-soft hover:border-moss/30 hover:text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-ink-soft">
                    {imagePack === "files"
                      ? "Each page downloads as its own image (best for a single page)."
                      : "All pages packed into one ZIP."}
                  </p>
                </div>
              </div>
            )}
            {tool.id === "compress-pdf" && (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <p className="text-sm font-medium text-ink">Target file size</p>
                  {files[0] && (
                    <p className="text-xs text-ink-soft">
                      Current: {formatBytes(files[0].size)}
                    </p>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min={1}
                    step="any"
                    value={targetSize}
                    onChange={(e) => setTargetSize(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-moss"
                    placeholder="e.g. 500"
                  />
                  <div className="grid grid-cols-2 rounded-xl border border-line bg-paper p-1">
                    {(["KB", "MB"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setTargetUnit(unit)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                          targetUnit === unit
                            ? "bg-moss text-paper"
                            : "text-ink-soft hover:text-ink"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
                {files[0] && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { label: "75%", factor: 0.75 },
                      { label: "50%", factor: 0.5 },
                      { label: "25%", factor: 0.25 },
                      { label: "1 MB", bytes: 1024 * 1024 },
                      { label: "500 KB", bytes: 500 * 1024 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft hover:border-moss hover:text-ink"
                        onClick={() => {
                          const bytes =
                            "bytes" in preset && preset.bytes
                              ? preset.bytes
                              : Math.max(
                                  1024,
                                  Math.floor(files[0].size * (preset.factor || 0.5)),
                                );
                          if (bytes >= 1024 * 1024) {
                            setTargetUnit("MB");
                            setTargetSize(
                              String(
                                Math.round((bytes / (1024 * 1024)) * 100) / 100,
                              ),
                            );
                          } else {
                            setTargetUnit("KB");
                            setTargetSize(String(Math.max(1, Math.round(bytes / 1024))));
                          }
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  We try lossless first. If needed, pages are recompressed to hit
                  your target — smaller targets may soften image quality.
                </p>
              </div>
            )}
            {tool.id === "pdf-to-word" && (
              <div>
                <p className="text-sm font-medium text-ink">Conversion mode</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      [
                        "visual",
                        "Keep exact look",
                        "Recommended for resumes. Word pages match the PDF visually (page images). Open in Word/Pages/Google Docs.",
                      ],
                      [
                        "editable",
                        "Editable text",
                        "Extracts text you can rewrite. Will NOT keep columns, colors, or exact resume layout.",
                      ],
                    ] as const
                  ).map(([id, label, desc]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFidelity(id)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        fidelity === id
                          ? "border-moss bg-moss-soft"
                          : "border-line bg-paper hover:border-line-strong"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-ink">
                        {label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
                        {desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tool.needsPassword && (
              <label className="block text-sm">
                <span className="font-medium text-ink">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-moss"
                  placeholder={
                    tool.id === "protect-pdf"
                      ? "Choose a password"
                      : "PDF password"
                  }
                />
              </label>
            )}
            {tool.needsText && (
              <label className="block text-sm">
                <span className="font-medium text-ink">
                  {tool.id === "watermark"
                    ? "Watermark text"
                    : tool.id === "sign-pdf"
                      ? "Signature name"
                      : tool.id === "redact-pdf"
                        ? "Text to redact"
                        : "Text"}
                </span>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-moss"
                />
              </label>
            )}
            {tool.id === "crop-pdf" && (
              <label className="block text-sm">
                <span className="font-medium text-ink">
                  Margin to crop (points): {cropMargin}
                </span>
                <input
                  type="range"
                  min={8}
                  max={96}
                  value={cropMargin}
                  onChange={(e) => setCropMargin(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--moss)]"
                />
              </label>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={status === "working"}
            className="pressable inline-flex items-center gap-2 rounded-full bg-moss px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-moss-deep disabled:opacity-50"
          >
            {status === "working" ? (
              <>
                <SpinnerGap className="h-4 w-4 animate-spin" />
                Working…
              </>
            ) : tool.needsCompare ? (
              "Compare"
            ) : (
              <>
                <DownloadSimple className="h-4 w-4" weight="bold" />
                {tool.id === "pdf-to-images"
                  ? imagePack === "zip"
                    ? "Download ZIP"
                    : `Download ${imageFormat === "png" ? "PNG" : "JPG"}`
                  : tool.output === "VIEW"
                    ? "Open"
                    : `Download ${tool.output}`}
              </>
            )}
          </button>
          {files.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFiles([]);
                setStatus("idle");
                setMessage("");
                setCompareReady(false);
              }}
              className="pressable rounded-full border border-line px-5 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-mist"
            >
              Clear
            </button>
          )}
        </div>

        {message && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
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
      </ToolCard>

      {compareReady && files.length === 2 && (
        <div className="mt-8">
          <CompareView left={files[0]} right={files[1]} />
        </div>
      )}
    </ToolPageShell>
  );
}
