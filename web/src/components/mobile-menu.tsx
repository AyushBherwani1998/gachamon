"use client";

import { Dialog } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";

/** Tailwind's `lg`: from here up the panels sit in columns beside the machine. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const iconButton =
  "grid size-11 shrink-0 place-items-center border-4 border-foreground bg-card text-foreground";

function PixelIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="24"
      height="24"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path fill="currentColor" d={path} />
    </svg>
  );
}

const MENU_ICON = "M1 2h10v2H1zM1 5h10v2H1zM1 8h10v2H1z";
const CLOSE_ICON =
  "M2 2h2v1H2zM3 3h2v1H3zM4 4h2v1H4zM5 5h2v2H5zM6 4h2v1H6zM7 3h2v1H7zM8 2h2v1H8zM4 7h2v1H4zM3 8h2v1H3zM2 9h2v1H2zM6 7h2v1H6zM7 8h2v1H7zM8 9h2v1H8z";

/**
 * Holds everything secondary on small screens, so the machine and pull button
 * are the whole page. Content only mounts while the menu is open.
 */
export function MobileMenu({
  closeWhen,
  children,
}: {
  /** Closes the menu when this turns true, so nothing sits behind the pack. */
  closeWhen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const [wasClosing, setWasClosing] = useState(closeWhen);
  if (closeWhen !== wasClosing) {
    setWasClosing(closeWhen);
    if (closeWhen) setOpen(false);
  }

  // Rotating a tablet can reach the desktop layout, which has no menu button.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={`${iconButton} lg:hidden`} aria-label="Open menu">
        <PixelIcon path={MENU_ICON} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="menu-overlay fixed inset-0 z-50 bg-foreground/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="menu-panel fixed inset-y-0 right-0 z-50 flex w-[min(92vw,420px)] flex-col border-l-4 border-foreground bg-background"
        >
          <div className="flex items-center justify-between gap-3 border-b-4 border-border/60 px-4 py-3">
            <Dialog.Title className="retro m-0 text-xs">Menu</Dialog.Title>
            <Dialog.Close className={iconButton} aria-label="Close menu">
              <PixelIcon path={CLOSE_ICON} />
            </Dialog.Close>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One collapsible section. Sharing a `name` keeps only one open at a time. */
export function MenuSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details name="mobile-menu" open={defaultOpen} className="menu-section group shrink-0">
      <summary className="retro flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 border-4 border-foreground bg-card px-3 text-[10px] [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-base leading-none group-open:hidden">
          +
        </span>
        <span aria-hidden="true" className="hidden text-base leading-none group-open:inline">
          -
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
