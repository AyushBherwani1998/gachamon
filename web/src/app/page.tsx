import { ConnectButton } from "@/components/connect-button";
import { Badge } from "@/components/ui/8bit/badge";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-foreground/20 pb-4">
        <div>
          <h1 className="retro text-lg sm:text-xl">CLAW MACHINE</h1>
          <p className="text-xs text-muted-foreground">xStocks on Monad</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">TESTNET</Badge>
          <ConnectButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center gap-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="retro text-sm">THE MACHINE</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="retro grid h-64 place-items-center border-4 border-dashed border-foreground/30 text-xs">
              8-BIT CLAW GOES HERE
            </div>
          </CardContent>
        </Card>

        <Button size="lg" className="min-h-12 min-w-56">
          Pull · 1 USDC
        </Button>

        <p className="text-xs text-muted-foreground">
          Common 98% · $0.73 · Legendary 2% · $10.00
        </p>
      </main>

      <footer className="border-t-4 border-foreground/20 pt-4 text-xs text-muted-foreground">
        Built for Monad Blitz · Powered by Pyth Entropy
      </footer>
    </div>
  );
}
