# Gacha pixel art

`gacha.px.js` is the source for every sprite in `web/public/sprites/`.

```bash
cd web/art
node ../../.agent-context/pxl/bin/pxl.js build gacha.px.js
cp out/sprites/*.png ../public/sprites/
```

`out/` is ignored. The exported PNGs are committed so the Next.js app has no
build-time dependency on the pxl tool.

Assets:

- `machine` 64x80 — marquee, glass dome with stock cards, coin slot, chute
- `card_back` 24x32, `card_common` 24x32, `card_legendary` 24x32
- `emblem_tsla`, `emblem_aapl`, `emblem_nvda`, `emblem_spy` — 16x16
- `coin` 8x8, `spark` 4x4

The card faces keep a transparent 16x16 window at (4, 6) for the emblem overlay
in the UI. All assets use a transparent background and are displayed at integer
scales only (2x, 3x, 4x) with `image-rendering: pixelated`.
