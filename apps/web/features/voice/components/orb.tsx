"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { LiveStatus } from "../hooks/use-live-talk";

/**
 * A single soft, cloudy blue sphere: blurred cloud layers drift inside the circle.
 * No rings or borders: state is expressed only through motion. Listening swells with
 * the user's speech level; thinking swirls faster; speaking breathes.
 */
const SWIRL_SECONDS: Record<LiveStatus, number> = {
  idle: 24,
  connecting: 24,
  listening: 18,
  thinking: 6,
  speaking: 12,
  error: 30,
};

export function Orb({
  status,
  levelRef,
  muted,
}: {
  status: LiveStatus;
  levelRef: RefObject<number>;
  muted: boolean;
}) {
  const sphereRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let smooth = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const target = status === "listening" && !muted ? (levelRef.current ?? 0) : 0;
      smooth += (target - smooth) * 0.15;
      sphereRef.current?.style.setProperty("--level", smooth.toFixed(3));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, muted, levelRef]);

  const idle = status === "idle" || status === "connecting" || status === "error" || muted;
  const seconds = SWIRL_SECONDS[status];
  const layer = (duration: number, reverse = false): CSSProperties => ({
    animation: `orb-swirl ${duration}s linear infinite${reverse ? " reverse" : ""}`,
  });

  return (
    <div className="flex size-56 items-center justify-center sm:size-64" aria-hidden>
      <div
        ref={sphereRef}
        className={cn(
          "relative size-40 overflow-hidden rounded-full sm:size-44",
          idle && "opacity-70 saturate-50"
        )}
        style={{
          transform: "scale(calc(1 + var(--level, 0) * 0.14))",
          transition: "transform 120ms ease-out, filter 700ms ease, opacity 700ms ease",
          background: "radial-gradient(circle at 45% 65%, #EEF3FF 0%, #C3D3FB 45%, #8FAEF7 100%)",
          boxShadow: "0 18px 40px -22px rgba(31, 91, 255, 0.45)",
          animation:
            status === "speaking"
              ? "orb-breathe 1.1s ease-in-out infinite"
              : status === "thinking"
                ? "orb-breathe 2.2s ease-in-out infinite"
                : undefined,
        }}
      >
        {/* Bold blue sweep along the rim (the reference's deep-blue crescent) */}
        <div
          className="absolute -inset-1/4 blur-md"
          style={{
            background:
              "radial-gradient(ellipse 62% 30% at 62% 22%, #1F5BFF 0%, rgba(31,91,255,0.85) 35%, rgba(31,91,255,0) 72%), radial-gradient(ellipse 22% 40% at 86% 58%, #2D66FF 0%, rgba(45,102,255,0) 70%)",
            ...layer(seconds),
          }}
        />
        {/* Crisp white cloud streaks */}
        <div
          className="absolute -inset-1/4 blur-[6px]"
          style={{
            background:
              "radial-gradient(ellipse 48% 11% at 46% 40%, #FFFFFF 0%, rgba(255,255,255,0.9) 40%, rgba(255,255,255,0) 75%), radial-gradient(ellipse 30% 9% at 58% 52%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 75%), radial-gradient(ellipse 26% 16% at 30% 68%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 75%)",
            ...layer(seconds * 1.35, true),
          }}
        />
        {/* Soft periwinkle haze for depth */}
        <div
          className="absolute -inset-1/4 blur-xl"
          style={{
            background:
              "radial-gradient(ellipse 40% 35% at 25% 30%, rgba(120,150,255,0.55) 0%, rgba(120,150,255,0) 70%), radial-gradient(ellipse 45% 30% at 60% 85%, rgba(160,185,255,0.6) 0%, rgba(160,185,255,0) 70%)",
            ...layer(seconds * 0.75),
          }}
        />
      </div>
    </div>
  );
}
