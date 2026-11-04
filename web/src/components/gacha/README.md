# PixelGachaMachine

The pixel-art gacha machine and tear-open card reveal for the Claw Machine app.

## Usage

```tsx
import { PixelGachaMachine, type GachaResult } from "@/components/gacha";

<PixelGachaMachine
  phase={phase}
  result={result}
  onRevealed={() => setRevealComplete(true)}
/>;
```

`phase` is one of `idle | approving | confirming | drawing | revealed | error`.
Pass `result` once the pull is resolved; the component keeps the card face down
until the player taps it or presses Enter / Space.

`onRevealed` fires once per pull, after the reveal animation has finished
(280 ms tear + 200 ms result enter). Under reduced motion the reveal is instant
and the callback still fires once, on the next tick.

```ts
type GachaPayout = {
  symbol: "TSLAx" | "AAPLx" | "NVDAx" | "SPYx" | string;
  amount: string; // human units, e.g. "0.0036"
  usd: string; // e.g. "0.73"
};

type GachaResult = {
  pullId: string;
  legendary: boolean;
  payouts: GachaPayout[];
  valueUsd: string;
  explorerUrl?: string;
};
```

The result panel maps the known tickers (`TSLAx`, `AAPLx`, `NVDAx`, `SPYx`) to their emblems; the machine launches with TSLAx only and the list always comes from the contract.
Unknown symbols fall back to a spark, so the component never breaks on a new
ticker.

## Preview

```bash
bun run dev
# open http://localhost:3000/preview
```

`/preview` has buttons for every phase, a common result, a legendary result
with two payouts, a replay button, an `onRevealed` counter, and a reduced-motion
toggle. The toggle sets `data-reduced-motion="true"` on a wrapper; `gacha.css`
honours both that attribute and `prefers-reduced-motion`.

## Motion and accessibility

- Drawing: `translate +/-2px`, `rotate +/-3deg`, `steps(2)` at 120 ms per step.
- Tear: two clipped layers split on a jagged edge, top `-24px / -6deg`, bottom
  `+24px / +4deg`, 280 ms `cubic-bezier(0.32, 0.72, 0, 1)`, then the result
  scales in from `0.95` over 200 ms.
- Legendary: one 600 ms gold flash plus 40 canvas particles. The canvas is
  removed when the burst finishes.
- Reduced motion: no jitter, no confetti, no movement; an opacity pulse while
  drawing and a static gold glow for legendary.
- The card is a real `<button aria-label="Tear open your card">` with a visible
  focus ring. A polite live region announces "Drawing..." and the result.
- Only `transform` and `opacity` are animated; there is no `transition: all`.
- Sprites render at integer scales (2x, 3x or 4x) with
  `image-rendering: pixelated` and explicit `width`/`height`.

## Styling

`gacha.css` is a global stylesheet imported by the component. Every class is
prefixed `gm-` and the palette lives in CSS custom properties scoped to
`.gm-root` (OKLCH). The scaffold's custom Turbopack CSS rule bypasses CSS-module
hashing, so prefixed globals are deliberate here; do not rename classes to
unprefixed names.

The pixel font is Pixelify Sans, loaded with `next/font/google` inside the
component and applied on the root. Numbers and amounts use the app's Geist Mono
variable with `font-variant-numeric: tabular-nums`.

## Art

PNG sprites live in `web/public/sprites/`. Their source is
`web/art/gacha.px.js`, built with the pxl pixel-art DSL:

```bash
cd web/art
node ../../.agent-context/pxl/bin/pxl.js build gacha.px.js
cp out/sprites/*.png ../public/sprites/
```

The generated PNGs are committed, so the app builds without the pxl tool.
