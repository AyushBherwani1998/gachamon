import {
  deployment,
  explorerAddress,
  isDeployed,
  IS_DEMO_MODE,
  PYTH_ENTROPY,
} from "@/config/deployments";

export function SiteFooter() {
  return (
    <footer className="mt-2 flex flex-col gap-2 border-t-4 border-border/60 pt-4 text-[10px] text-muted-foreground">
      {IS_DEMO_MODE ? (
        <p>Demo mode — pulls are simulated locally. No contract or wallet is used.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            ClawMachine:{" "}
            {isDeployed(deployment.clawMachine) ? (
              <a
                href={explorerAddress(deployment.key, deployment.clawMachine)}
                target="_blank"
                rel="noopener noreferrer"
                className="amount text-primary underline decoration-dotted underline-offset-4"
              >
                {deployment.clawMachine}
              </a>
            ) : (
              <span className="amount">not deployed on {deployment.name} yet</span>
            )}
          </span>
          <span>
            USDC:{" "}
            {isDeployed(deployment.usdc) ? (
              <a
                href={explorerAddress(deployment.key, deployment.usdc)}
                target="_blank"
                rel="noopener noreferrer"
                className="amount text-primary underline decoration-dotted underline-offset-4"
              >
                {deployment.usdc}
              </a>
            ) : (
              <span className="amount">not configured</span>
            )}
          </span>
        </div>
      )}
      <p>
        Randomness by Pyth Entropy{" "}
        <a
          href={explorerAddress(deployment.key, PYTH_ENTROPY)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-4"
        >
          ({PYTH_ENTROPY.slice(0, 6)}…{PYTH_ENTROPY.slice(-4)})
        </a>{" "}
        · Built for Monad Blitz
      </p>
    </footer>
  );
}
