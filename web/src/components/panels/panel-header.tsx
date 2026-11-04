import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared card header used by every panel so the eyebrow / title / tag rhythm
 * is identical across the app.
 */
export function PanelHeader({
  eyebrow,
  title,
  tag,
}: {
  eyebrow: string;
  title: string;
  tag?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-foreground/15 pb-3">
      <div className="min-w-0">
        <p className="retro text-[8px] uppercase leading-relaxed tracking-wider text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="retro mt-1.5 text-[11px] leading-relaxed text-foreground sm:text-xs">
          {title}
        </h2>
      </div>
      {tag}
    </div>
  );
}

const TAG_TONES = {
  muted: "border-foreground/25 bg-foreground/5 text-muted-foreground",
  live: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200",
  gold: "border-amber-300/40 bg-amber-300/10 text-amber-200",
} as const;

export function PanelTag({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TAG_TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "retro inline-flex shrink-0 items-center gap-1.5 border-2 px-2 py-1 text-[8px] uppercase leading-none",
        TAG_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block bg-foreground/10 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
