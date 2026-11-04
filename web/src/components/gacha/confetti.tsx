"use client";

import { useEffect, useRef, useState } from "react";

import "./gacha.css";

const COLORS = ["#ffd75e", "#fff6e0", "#b79cff", "#cfd6e6", "#8b5cf6", "#3ddc97"];
const MAX_PARTICLES = 40;
const DURATION = 1150;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  angle: number;
  spin: number;
};

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    let seed = 0x9e3779b9;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    const originX = width / 2;
    const originY = height * 0.46;
    const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => {
      const angle = -Math.PI / 2 + (random() - 0.5) * 2.4;
      const speed = 2.2 + random() * 4.2;
      return {
        x: originX + (random() - 0.5) * 36,
        y: originY + (random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.floor(random() * 3),
        color: COLORS[Math.floor(random() * COLORS.length)],
        angle: random() * Math.PI,
        spin: (random() - 0.5) * 0.34,
      };
    });

    const start = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / DURATION);
      ctx.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.vy += 0.16;
        particle.vx *= 0.995;
        particle.x += particle.vx;
        particle.y += particle.vy;

        ctx.globalAlpha = progress < 0.65 ? 1 : 1 - (progress - 0.65) / 0.35;
        ctx.fillStyle = particle.color;
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.angle + elapsed * 0.001 * particle.spin * 10);
        ctx.fillRect(
          -particle.size / 2,
          -particle.size / 2,
          particle.size,
          particle.size,
        );
        ctx.restore();
      }

      if (progress < 1) {
        frame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, width, height);
        setDone(true);
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  if (done) return null;

  return <canvas ref={canvasRef} className="gm-confetti" aria-hidden="true" />;
}
