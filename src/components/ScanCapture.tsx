"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "@phosphor-icons/react";

export function ScanCapture({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setError("Camera access denied or unavailable. Upload photos instead.");
    }
  };

  const snap = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(
        new File([blob], `scan-${Date.now()}.png`, { type: "image/png" }),
      );
    }, "image/png");
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  return (
    <div className="rounded-2xl border border-line bg-mist/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {!active ? (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
          >
            <Camera className="h-4 w-4" weight="bold" />
            Open camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={snap}
              className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-paper"
            >
              Capture page
            </button>
            <button
              type="button"
              onClick={stop}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium"
            >
              Close camera
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
      <video
        ref={videoRef}
        muted
        playsInline
        className={`mt-3 w-full rounded-xl bg-ink ${active ? "block" : "hidden"}`}
      />
    </div>
  );
}
