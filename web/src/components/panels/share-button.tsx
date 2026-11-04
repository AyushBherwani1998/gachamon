"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * True only after hydration. Lets ShareButton fall back to the current origin
 * without a server/client markup mismatch.
 */
function useIsMounted() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn("size-3.5 shrink-0", className)}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Opens an X post intent in a new tab. `url` may be an empty string; once
 * mounted the component falls back to the current origin so local previews
 * share the right link.
 */
export function ShareButton({ text, url }: { text: string; url: string }) {
  const mounted = useIsMounted();
  const target = url || (mounted ? window.location.origin : "");
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}${
    target ? `&url=${encodeURIComponent(target)}` : ""
  }`;

  return (
    <a
      href={intent}
      target="_blank"
      rel="noopener noreferrer"
      title="Opens X in a new tab"
      className={cn(
        "relative inline-flex min-h-11 w-full items-center justify-center gap-2",
        "border-2 border-foreground bg-background px-4 py-2",
        "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground",
        "shadow-[3px_3px_0_0_var(--color-foreground)]",
        "transition-[transform,background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        "hover:bg-foreground hover:text-background",
        "active:translate-x-px active:translate-y-px active:scale-[0.96] active:shadow-[1px_1px_0_0_var(--color-foreground)] motion-reduce:active:scale-100 motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0",
        "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-foreground",
      )}
    >
      <XLogo />
      Share my pull
    </a>
  );
}
