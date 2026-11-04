import { Badge } from "@/components/ui/8bit/badge";
import { Button } from "@/components/ui/8bit/button";
import { ConnectButton } from "@/components/connect-button";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";
import type { ReactNode } from "react";

export function SiteHeader({ menu }: { menu?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-border/60 pb-4">
      {/* On phones this leaves exactly enough room for the menu button beside it. */}
      <div className="flex w-[calc(100%-56px)] min-w-0 items-center gap-3 sm:w-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sprites/logo_icon.png"
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 [image-rendering:pixelated] max-[359px]:hidden"
        />
        <div>
          <h1 className="m-0 leading-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sprites/logo_wordmark.png"
              alt="Gachamon"
              width={190}
              height={34}
              className="h-[34px] w-[190px] [image-rendering:pixelated]"
            />
          </h1>
          <p className="mt-1.5 text-[11px] text-muted-foreground max-[399px]:hidden">
            Gacha catch &apos;em all · Real xStocks on Monad
          </p>
        </div>
      </div>
      {menu ? <div className="sm:order-last lg:hidden">{menu}</div> : null}
      <div className="order-last flex w-full flex-wrap items-center justify-between gap-2 sm:order-none sm:ml-auto sm:w-auto sm:justify-end">
        {IS_DEMO_MODE ? (
          <Badge className="border-amber-500 bg-amber-300 text-black">DEMO</Badge>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 cursor-default border-primary bg-primary/10 text-primary hover:bg-primary/10"
          disabled
          aria-label={`Network: ${deployment.name}`}
        >
          {deployment.name.toUpperCase()}
        </Button>
        {IS_DEMO_MODE ? (
          <Badge className="hidden border-border bg-secondary text-secondary-foreground sm:inline-flex">NO WALLET NEEDED</Badge>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  );
}
