# PixelGachaMachine

The Gachamon machine and its fullscreen pack tear.

```tsx
<PixelGachaMachine phase={phase} result={result} onRevealed={() => setRevealed(true)} />
```

`phase` is `idle | approving | confirming | drawing | revealed | error`. `onRevealed`
fires once per pull, when the player continues past the revealed card.

## Flow

1. The machine displays a Rare and a Legendary pack. It shakes while `drawing`.
2. On `revealed`, the pack for `result.legendary` drops into the tray. The tier is now
   known and the stock is not. "Rare" is only a UI label for a non-legendary pull.
3. The pack fills the screen (`pack-tear.tsx`) and the player tears it.
4. The card markup only renders after the tear, so the stock can't leak before it.

The chain knows the stock as soon as the pull resolves. `page.tsx` therefore keeps the
player's own pull out of the live feed and the live region until `onRevealed`.

## Opening a pack

| Input | Behaviour |
| --- | --- |
| Mouse | Press, hold and swipe either way. A plain click does nothing. |
| Touch / pen | Drag to tear, or tap to play the tear. |
| Keyboard / assistive tech | Enter or Space plays the tear (`click.detail === 0`). |
| Reduced motion | Press to open. The pack is replaced with no rip or burst. |

Esc before the tear returns the pack to the tray, where it can be re-opened. The payout
is already in the wallet, so nothing is lost.

`use-tear-gesture.ts` holds the rules: finish past 92%, or on release past 55%, or on a
flick (0.5 px/ms, at least 15% in). Anything else springs back. Progress goes straight
to the DOM, and the rip position snaps to whole sprite pixels.

The reveal maps the known tickers (`TSLAx`, `AAPLx`, `NVDAx`, `SPYx`) to their emblems.
The machine launches with TSLAx only. Unknown symbols fall back to a spark, so a new
ticker can't break the reveal.

## Sound

`sfx.ts` synthesizes every effect with Web Audio, so there are no audio files. Browsers
keep audio locked until a user gesture, so nothing plays before the first tap or key
press. `SoundToggle` mutes everything and remembers the choice in `localStorage`.

| Moment | Sound |
| --- | --- |
| `drawing` starts | Coin |
| Pack lands | Thud, plus a sparkle for Legendary |
| Idle wobble | Foil crinkle, for the first 5 bursts only |
| Tearing | A tick per tooth of the tear line, rising in pitch |
| Strip comes off | Rip |
| Card revealed | Arpeggio, or a longer fanfare for Legendary. None if there's no payout. |
| `error` | Two falling notes |

## Preview

`/preview` has every machine state plus Rare, Legendary, multi-stock and no-payout
packs, so the tear can be rehearsed without a wallet or waiting on 2% odds.

## Styling and art

`gacha.css` is a global stylesheet: classes are prefixed `gm-` and tokens live on
`.gm-vars`. Sprites render at integer scales with `image-rendering: pixelated`. Their
source is `web/art/gacha.px.js`; see `web/art/README.md`.
