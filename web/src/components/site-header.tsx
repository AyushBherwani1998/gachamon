import { Badge } from "@/components/ui/8bit/badge";
import { ConnectButton } from "@/components/connect-button";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";

export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-border/60 pb-4">
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
      <div className="flex flex-wrap items-center gap-2">
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
          <Badge className="border-border bg-secondary text-secondary-foreground">NO WALLET NEEDED</Badge>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  );
}
