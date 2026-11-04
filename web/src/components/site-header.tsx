import { Badge } from "@/components/ui/8bit/badge";
import { ConnectButton } from "@/components/connect-button";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";

export function SiteHeader() {
  return (
    <header className="flex flex-col gap-3 border-b-4 border-border/60 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sprites/logo_icon.png"
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 [image-rendering:pixelated]"
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
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gacha catch &apos;em all · Real xStocks on Monad
          </p>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
        {IS_DEMO_MODE ? (
          <Badge className="border-amber-500 bg-amber-300 text-black">DEMO</Badge>
        ) : null}
        <Badge
          variant="outline"
          className="border-primary bg-primary/10 text-[8px] text-primary"
        >
          {deployment.name.toUpperCase()}
        </Badge>
        {IS_DEMO_MODE ? (
          <Badge className="hidden border-border bg-secondary text-secondary-foreground sm:inline-flex">NO WALLET NEEDED</Badge>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  );
}
