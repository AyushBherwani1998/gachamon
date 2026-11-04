import { Badge } from "@/components/ui/8bit/badge";
import { ConnectButton } from "@/components/connect-button";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";

export function SiteHeader() {
  return (
    <header className="flex flex-col gap-3 border-b-4 border-border/60 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-11 place-items-center border-4 border-foreground bg-primary text-primary-foreground"
        >
          <span className="retro text-[10px]">CM</span>
        </div>
        <div>
          <h1 className="retro text-base leading-relaxed sm:text-lg">CLAW MACHINE</h1>
          <p className="text-[11px] text-muted-foreground">
            Real xStocks · One pull at a time · Monad
          </p>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
        {IS_DEMO_MODE ? (
          <Badge className="border-[#ffd45f] bg-[#ffd45f] text-black">DEMO</Badge>
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
