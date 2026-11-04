"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * True when the OS asks for reduced motion, or when a review surface marks
 * an ancestor with data-reduced-motion="true" (used by /preview).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const marked = () =>
      document.querySelector('[data-reduced-motion="true"]') !== null;

    const sync = () => setReduced(media.matches || marked());

    sync();
    media.addEventListener("change", sync);

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduced-motion"],
      subtree: true,
    });

    return () => {
      media.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}
