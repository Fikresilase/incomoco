"use client";

import { useEffect, useRef } from "react";

const BAR_WIDTH = 3;
const GAP = 3;

/**
 * Scrolling waveform of recent input levels, drawn on a canvas each animation frame
 * (no React re-renders while recording).
 */
export function LevelMeter({
  getLevel,
  className,
  color = "#EA4E35",
}: {
  getLevel: () => number;
  className?: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const levels: number[] = [];
    let frame = 0;
    let last = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 50) return; // ~20 fps is plenty for a meter
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const maxBars = Math.max(1, Math.floor(width / (BAR_WIDTH + GAP)));
      levels.push(getLevel());
      while (levels.length > maxBars) levels.shift();

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      const offset = width - levels.length * (BAR_WIDTH + GAP);
      levels.forEach((level, i) => {
        const h = Math.max(3, Math.min(1, level) * height);
        const x = offset + i * (BAR_WIDTH + GAP);
        const y = (height - h) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, h, BAR_WIDTH / 2);
        ctx.fill();
      });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [getLevel, color]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
