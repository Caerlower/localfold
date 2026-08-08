"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clampCropRect, type CropRectNorm } from "@/lib/pdfStudio";

type Handle =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

type Props = {
  rect: CropRectNorm;
  onChange: (next: CropRectNorm) => void;
  accent?: string;
};

/**
 * Interactive crop rectangle over a page preview (percent-based, top-left origin).
 */
export function CropBoxOverlay({
  rect,
  onChange,
  accent = "#2B7DE9",
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    origin: CropRectNorm;
    boxW: number;
    boxH: number;
  } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.boxW;
      const dy = (e.clientY - drag.startY) / drag.boxH;
      const o = drag.origin;
      let next: CropRectNorm = { ...o };

      switch (drag.handle) {
        case "move":
          next = { ...o, x: o.x + dx, y: o.y + dy };
          break;
        case "e":
          next = { ...o, w: o.w + dx };
          break;
        case "w":
          next = { ...o, x: o.x + dx, w: o.w - dx };
          break;
        case "s":
          next = { ...o, h: o.h + dy };
          break;
        case "n":
          next = { ...o, y: o.y + dy, h: o.h - dy };
          break;
        case "se":
          next = { ...o, w: o.w + dx, h: o.h + dy };
          break;
        case "sw":
          next = { ...o, x: o.x + dx, w: o.w - dx, h: o.h + dy };
          break;
        case "ne":
          next = { ...o, w: o.w + dx, y: o.y + dy, h: o.h - dy };
          break;
        case "nw":
          next = { ...o, x: o.x + dx, w: o.w - dx, y: o.y + dy, h: o.h - dy };
          break;
      }

      if (next.w < 0.05) {
        if (drag.handle.includes("w")) next.x = o.x + o.w - 0.05;
        next.w = 0.05;
      }
      if (next.h < 0.05) {
        if (drag.handle.includes("n")) next.y = o.y + o.h - 0.05;
        next.h = 0.05;
      }

      onChangeRef.current(clampCropRect(next));
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerDown = useCallback(
    (handle: Handle, e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const stage = stageRef.current;
      if (!stage) return;
      const bounds = stage.getBoundingClientRect();
      dragRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...rect },
        boxW: Math.max(bounds.width, 1),
        boxH: Math.max(bounds.height, 1),
      };
    },
    [rect],
  );

  const handles: { id: Handle; className: string; cursor: string }[] = [
    {
      id: "n",
      className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
      cursor: "ns-resize",
    },
    {
      id: "s",
      className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
      cursor: "ns-resize",
    },
    {
      id: "e",
      className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
      cursor: "ew-resize",
    },
    {
      id: "w",
      className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
      cursor: "ew-resize",
    },
    {
      id: "nw",
      className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
      cursor: "nwse-resize",
    },
    {
      id: "ne",
      className: "right-0 top-0 translate-x-1/2 -translate-y-1/2",
      cursor: "nesw-resize",
    },
    {
      id: "sw",
      className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
      cursor: "nesw-resize",
    },
    {
      id: "se",
      className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
      cursor: "nwse-resize",
    },
  ];

  return (
    <div ref={stageRef} className="absolute inset-0 z-10">
      <div
        role="presentation"
        onPointerDown={(e) => onPointerDown("move", e)}
        className="absolute touch-none"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
          border: `2px solid ${accent}`,
          boxShadow: "0 0 0 9999px rgba(15, 23, 32, 0.45)",
          cursor: "move",
          background: `${accent}22`,
        }}
      >
        {handles.map((h) => (
          <span
            key={h.id}
            role="presentation"
            onPointerDown={(e) => onPointerDown(h.id, e)}
            className={`absolute z-20 h-3.5 w-3.5 rounded-full border-2 border-white shadow ${h.className}`}
            style={{ background: accent, cursor: h.cursor }}
          />
        ))}
      </div>
    </div>
  );
}
