"use client";

import { GRID_POSITIONS, type GridPos } from "@/lib/pdfStudio";

export function PositionGrid({
  value,
  onChange,
}: {
  value: GridPos;
  onChange: (v: GridPos) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">Position</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-mist/50 p-2">
        {GRID_POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            aria-label={pos}
            onClick={() => onChange(pos)}
            className={`flex h-9 items-center justify-center rounded-lg border transition ${
              value === pos
                ? "border-moss bg-paper shadow-sm"
                : "border-transparent bg-paper/60 hover:border-line"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                value === pos ? "bg-moss" : "bg-line-strong"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
