"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card";
import { cn } from "@/lib/utils";

import { PANEL_FONT, PanelHeader, PanelSkeleton, PanelTag } from "./panel-header";
import { PixelGlyph } from "./pixel";

type QrResult = {
  url: string;
  png: string | null;
  failed: boolean;
};

function prettyUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}

export function QrCard({
  url,
  caption = "Free play on testnet - scan to pull",
}: {
  url: string;
  caption?: string;
}) {
  const [result, setResult] = useState<QrResult | null>(null);

  useEffect(() => {
    let alive = true;

    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 640,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((png) => {
        if (alive) setResult({ url, png, failed: false });
      })
      .catch(() => {
        if (alive) setResult({ url, png: null, failed: true });
      });

    return () => {
      alive = false;
    };
  }, [url]);

  const current = result?.url === url ? result : null;
  const png = current?.png ?? null;
  const failed = current?.failed ?? false;

  return (
    <Card
      font="normal"
      className={cn("h-full", PANEL_FONT)}
      aria-busy={!current || undefined}
    >
      <CardHeader font="normal">
        <PanelHeader
          eyebrow="Point a phone at the screen"
          title="Scan to play"
          tag={<PanelTag tone="gold">Testnet</PanelTag>}
        />
      </CardHeader>

      <CardContent font="normal" className="flex flex-col items-center gap-4 pb-6">
        <div
          className={cn(
            "relative w-full max-w-[320px] border-4 border-foreground bg-white p-2",
            "shadow-[6px_6px_0_0_var(--color-amber-300)]",
          )}
        >
          <div className="aspect-square w-full bg-white">
            {png ? (
              // The QR is generated locally as a data URL; next/image would
              // re-optimise it and blur the modules.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={png}
                alt={`QR code linking to ${url}`}
                width={640}
                height={640}
                className="h-full w-full [image-rendering:pixelated]"
              />
            ) : (
              <div
                role="status"
                className="grid h-full w-full place-items-center bg-white p-4 text-center"
              >
                {failed ? (
                  <span className="font-mono text-[11px] leading-relaxed text-black/70">
                    QR unavailable. Use the link below.
                  </span>
                ) : (
                  <span className="w-full">
                    <PanelSkeleton className="mx-auto h-3 w-2/3 bg-black/15!" />
                    <PanelSkeleton className="mx-auto mt-3 h-3 w-1/2 bg-black/15!" />
                    <span className="sr-only">Generating QR code…</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="retro max-w-[28ch] text-center text-[10px] leading-[1.8] text-amber-200">
          {caption}
        </p>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex min-h-11 max-w-full items-center gap-1.5 px-2",
            "font-mono text-[10px] text-muted-foreground underline decoration-dotted underline-offset-4",
            "transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none",
            "active:scale-[0.96] motion-reduce:active:scale-100",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
          )}
        >
          <span className="truncate">{prettyUrl(url)}</span>
          <PixelGlyph name="arrow" className="size-2.5 shrink-0" />
        </a>
      </CardContent>
    </Card>
  );
}
