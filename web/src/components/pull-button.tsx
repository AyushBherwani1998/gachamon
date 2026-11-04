"use client";

import { Button } from "@/components/ui/8bit/button";
import { cn } from "@/lib/utils";

interface PullButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}

export function PullButton({ label, onClick, disabled, busy, className }: PullButtonProps) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className={cn(
        "min-h-14 w-full max-w-sm text-xs sm:text-sm pixel-shadow",
        className
      )}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="mr-1 inline-block size-2 animate-pulse bg-primary-foreground"
        />
      ) : null}
      {label}
    </Button>
  );
}
