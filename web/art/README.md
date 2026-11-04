# Gachamon pixel art

`gacha.px.js` is the source for every sprite in `web/public/sprites/`. It is built with
the pxl pixel-art DSL:

```bash
cd web/art
node <path to pxl>/bin/pxl.js build gacha.px.js
cp out/sprites/*.png ../public/sprites/
```

`out/` is ignored. The exported PNGs are committed so the Next.js app has no build-time
dependency on the pxl tool.

Assets:

- `logo_wordmark` 95x17, `logo_icon` 16x16
- `machine` 80x104: marquee, both packs on display, controls, empty chute
- `pack_rare`, `pack_legendary` 48x64. The UI tears along row 10, so keep rows 8-12 free
  of anything important.
- `card_rare`, `card_legendary` 24x32, with a plain 16x16 emblem window at (4, 6)
- `emblem_tsla`, `emblem_aapl`, `emblem_nvda`, `emblem_spy` 16x16
- `coin` 8x8, `spark` 4x4

Sprites are displayed at integer scales only, with `image-rendering: pixelated`.
