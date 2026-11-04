// Pixel art for the Claw Machine gacha UI.
// Build: node ../../.agent-context/pxl/bin/pxl.js build gacha.px.js
// Export: copy out/sprites/*.png -> ../public/sprites/

pal({
  k: "#100c20", // outline / near black
  d: "#1a1436",
  D: "#2a2054", // deep purple shadow
  p: "#58379f", // purple shadow
  P: "#8b5cf6", // Monad purple
  H: "#b79cff", // purple highlight
  h: "#e9e0ff", // pale lavender
  c: "#fff6e0", // cream
  s: "#cfd6e6", // silver
  S: "#8b95ad", // silver shadow
  w: "#eef2fa", // silver highlight
  g: "#ffd75e", // gold
  G: "#c98a1e", // gold shadow
  y: "#fff0b8", // gold highlight
  b: "#66d9ff", // cyan
  B: "#2a6f9e", // blue shadow
  n: "#0d1424", // card inner / glass night
  e: "#3ddc97", // green
  E: "#1c8f60", // green shadow
  r: "#ef5350", // red
  R: "#a6323c", // red shadow
  o: "#ff8a7a", // red highlight
  u: "#5b8cff", // chart blue
  U: "#2f4fb8", // chart blue shadow
  t: "#8a5a3c", // stem brown
  T: "#5c3a26", // stem shadow
});

// ---------------------------------------------------------------- machine ---
// 64x80 gacha cabinet: marquee, glass dome with stock cards, coin plate,
// dispenser chute, Monad-purple body.
sprite("machine", { w: 64, h: 80 }, (c) => {
  // soft drop shadow / base plinth
  c.rect(5, 76, 54, 4, "k");
  c.rect(7, 77, 50, 2, "d");

  // feet
  c.rect(7, 74, 10, 5, "k");
  c.rect(8, 75, 8, 3, "p");
  c.hline(8, 75, 8, "H");
  c.rect(47, 74, 10, 5, "k");
  c.rect(48, 75, 8, 3, "p");
  c.hline(48, 75, 8, "H");

  // ---- marquee -----------------------------------------------------------
  c.rect(4, 0, 56, 16, "k");
  c.rect(5, 1, 54, 14, "P");
  c.rect(6, 2, 52, 12, "D");
  c.hline(5, 1, 54, "H");
  c.vline(5, 2, 13, "H");
  c.vline(58, 2, 13, "p");
  c.rect(7, 3, 50, 10, "d");

  // round the top corners of the cabinet
  c.px(4, 0, "_");
  c.px(59, 0, "_");
  c.px(4, 1, "_");
  c.px(59, 1, "_");

  // bulbs at the corners of the marquee
  c.px(7, 2, "y");
  c.px(56, 2, "y");
  c.px(7, 13, "G");
  c.px(56, 13, "G");

  // "CLAW" in cream, 2x
  c.text(17, 3, "CLAW", "c", { scale: 2, gap: 1 });

  // little sparkles either side
  c.px(11, 6, "c");
  c.px(12, 7, "y");
  c.px(12, 5, "y");
  c.px(13, 6, "c");
  c.px(11, 8, "p");
  c.px(52, 6, "c");
  c.px(51, 7, "y");
  c.px(51, 5, "y");
  c.px(50, 6, "c");
  c.px(52, 8, "p");

  // ---- cabinet shoulders -------------------------------------------------
  c.rect(2, 16, 60, 34, "k");
  c.rect(3, 17, 58, 32, "P");
  c.rect(3, 17, 58, 2, "H");
  c.rect(58, 18, 3, 30, "p");
  c.rect(3, 48, 58, 2, "p");
  c.px(2, 16, "_");
  c.px(61, 16, "_");

  // ---- glass dome --------------------------------------------------------
  c.rect(6, 18, 52, 31, "k");
  // purple bezel with a lit top edge; the glass arch is stepped
  c.rect(7, 19, 50, 29, "H");
  c.rect(8, 20, 48, 27, "p");
  c.hline(7, 19, 50, "h");
  c.rect(9, 22, 46, 24, "n");
  c.rect(11, 21, 42, 1, "n");
  c.rect(14, 20, 36, 1, "n");
  c.rect(10, 45, 44, 1, "n");
  // frame shadow under the arch
  c.hline(9, 21, 46, "D");
  c.px(9, 22, "D");
  c.px(54, 22, "D");
  // subtle vertical tint + cool bottom
  c.grad(9, 23, 46, 22, "nD", "v", 0.35);
  c.hline(10, 44, 44, "B");
  c.hline(10, 45, 44, "d");

  // four mini cards stacked inside
  const mini = (x, y, edge, face, chip) => {
    c.rect(x, y, 8, 10, "k");
    c.rect(x + 1, y + 1, 6, 8, edge);
    c.rect(x + 2, y + 2, 4, 5, face);
    c.rect(x + 2, y + 7, 4, 1, edge);
    c.px(x + 3, y + 4, chip);
    c.px(x + 4, y + 4, chip);
    c.px(x + 3, y + 5, chip);
    c.px(x + 1, y + 1, "w");
  };
  mini(11, 35, "s", "D", "b");
  mini(21, 33, "g", "D", "y");
  mini(31, 36, "s", "D", "e");
  mini(41, 34, "H", "D", "u");
  // shelf they sit on
  c.hline(9, 45, 46, "D");
  c.hline(11, 46, 42, "d");

  // thin glass reflections (drawn over the prizes, kept off the cards)
  c.poly([12, 44, 14, 44, 25, 23, 23, 23], "#66d9ff2b");
  c.poly([18, 44, 19, 44, 29, 23, 28, 23], "#66d9ff16");
  c.poly([45, 22, 48, 22, 52, 27, 51, 30], "#66d9ff1c");
  c.px(48, 23, "#d8ecff88");
  c.px(47, 24, "#d8ecff44");
  c.px(13, 24, "#d8ecff66");

  // bezel bolts
  c.px(8, 20, "h");
  c.px(55, 20, "P");
  c.px(8, 46, "p");
  c.px(55, 46, "p");

  // ---- lower body --------------------------------------------------------
  c.rect(2, 50, 60, 26, "k");
  c.rect(3, 51, 58, 24, "P");
  c.vline(3, 52, 22, "H");
  c.vline(4, 52, 22, "p");
  c.rect(57, 51, 3, 24, "p");
  c.rect(59, 51, 2, 24, "D");
  c.hline(5, 51, 52, "H");
  // side seams + rivets
  c.vline(13, 52, 7, "p");
  c.vline(46, 52, 7, "p");
  c.px(6, 54, "h");
  c.px(6, 72, "h");
  c.px(57, 72, "D");

  // sticker on the left: a little Monad diamond
  c.rect(6, 55, 11, 11, "k");
  c.rect(7, 56, 9, 9, "c");
  c.poly([11, 57, 15, 61, 11, 65, 7, 61], "P");
  c.poly([11, 59, 13, 61, 11, 63, 9, 61], "H");
  c.px(11, 58, "h");

  // ---- dispenser chute ---------------------------------------------------
  c.rect(15, 57, 30, 18, "k");
  c.rect(16, 58, 28, 16, "D");
  c.rect(17, 59, 26, 13, "d");
  // flap
  c.rect(18, 60, 24, 3, "p");
  c.hline(18, 60, 24, "H");
  c.hline(18, 62, 24, "D");
  c.px(35, 61, "h");
  // a card waiting in the chute
  c.rect(22, 65, 14, 6, "k");
  c.rect(23, 66, 12, 4, "s");
  c.rect(24, 67, 10, 2, "D");
  c.px(26, 67, "b");
  c.px(28, 68, "u");
  c.hline(16, 71, 28, "p");
  c.hline(16, 72, 28, "H");
  c.rect(15, 72, 30, 2, "k");
  c.hline(16, 73, 28, "h");

  // ---- coin plate --------------------------------------------------------
  c.rect(46, 54, 13, 13, "k");
  c.rect(47, 55, 11, 11, "s");
  c.rect(48, 56, 9, 9, "S");
  c.hline(47, 55, 11, "w");
  c.vline(47, 56, 9, "w");
  // horizontal slot
  c.rect(49, 58, 7, 3, "k");
  c.hline(49, 58, 7, "n");
  c.hline(49, 60, 7, "h");
  // engraved 1
  c.text(52, 62, "1", "c", { scale: 1 });

  // coin going in, half swallowed by the slot
  c.circ(52, 55, 3, "G");
  c.circ(52, 55, 2, "g");
  c.px(51, 54, "y");
  c.px(52, 54, "y");
  c.hline(53, 55, 1, "G");
});

// ------------------------------------------------------------------ cards ---
// 24x32 card back / faces. The 16x16 emblem window is at (4, 6) on the faces.
sprite("card_back", { w: 24, h: 32 }, (c) => {
  c.rect(0, 0, 24, 32, "k");
  c.rect(1, 1, 22, 30, "H");
  c.rect(2, 2, 20, 28, "P");
  c.rect(2, 2, 20, 2, "H");
  c.rect(3, 4, 18, 24, "D");
  // woven diamond pattern
  for (let y = 6; y < 27; y += 4) {
    for (let x = 6; x < 19; x += 4) {
      c.px(x, y, "p");
      c.px(x + 1, y + 1, "p");
      c.px(x + 2, y, "p");
    }
  }
  // border studs
  c.px(2, 2, "h");
  c.px(21, 2, "c");
  c.px(2, 29, "p");
  c.px(21, 29, "p");
  // central gem / claw mark
  c.poly([12, 8, 18, 14, 12, 22, 6, 14], "k");
  c.poly([12, 9, 17, 14, 12, 21, 7, 14], "c");
  c.poly([12, 11, 15, 14, 12, 19, 9, 14], "P");
  c.poly([12, 13, 13, 14, 12, 17, 11, 14], "H");
  c.px(12, 7, "y");
  // tiny corner brackets
  c.hline(4, 4, 3, "p");
  c.vline(4, 4, 3, "p");
  c.hline(17, 27, 3, "p");
  c.vline(20, 25, 3, "p");
});

const cardFace = (frame, frameLight, frameDark, inner, gem, extra = false) => (c) => {
  c.rect(0, 0, 24, 32, "k");
  c.rect(1, 1, 22, 30, frame);
  c.rect(1, 1, 22, 2, frameLight);
  c.rect(3, 3, 18, 26, "k");
  c.rect(4, 4, 16, 24, inner);
  // inner frame line
  c.rect(4, 4, 16, 1, frameDark);
  c.rect(4, 4, 1, 24, frameDark);
  // emblem window, exactly 16x16 at (4, 6)
  c.rect(4, 6, 16, 16, "n");
  c.rect(4, 6, 16, 1, "d");
  // bottom plate
  c.rect(4, 23, 16, 5, frameDark);
  c.rect(5, 24, 14, 3, frame);
  c.hline(6, 25, 12, frameLight);
  c.px(11, 25, gem);
  c.px(12, 26, gem);
  // small studs along the top frame
  c.px(5, 1, frameLight);
  c.px(8, 2, frameDark);
  c.px(15, 2, frameDark);
  c.px(18, 1, frameLight);
  // corner studs
  c.px(1, 1, frameLight);
  c.px(22, 1, frameLight);
  c.px(1, 30, frameDark);
  c.px(22, 30, frameDark);
  // outer metal edge
  c.vline(1, 3, 26, frameLight);
  c.hline(3, 30, 18, frameDark);
  c.vline(22, 3, 26, frameDark);
  // holo glint
  c.px(5, 5, "#ffffff77");
  c.px(6, 6, "#ffffff44");
  if (extra) {
    // legendary rays + sparkles
    c.px(2, 2, "y");
    c.px(3, 3, "c");
    c.px(21, 2, "y");
    c.px(20, 3, "c");
    c.px(2, 29, "G");
    c.px(21, 29, "G");
    c.px(7, 1, "y");
    c.px(16, 1, "y");
    c.px(12, 30, "y");
  }
};

sprite(
  "card_common",
  { w: 24, h: 32 },
  cardFace("s", "w", "S", "D", "b"),
);
sprite(
  "card_legendary",
  { w: 24, h: 32 },
  cardFace("g", "y", "G", "#3a2254", "y", true),
);

// --------------------------------------------------------------- emblems ---
// 16x16, transparent background so the card window shows through.
sprite("emblem_tsla", { w: 16, h: 16 }, (c) => {
  // red T
  c.rect(2, 2, 12, 4, "r");
  c.hline(2, 2, 12, "o");
  c.rect(6, 6, 4, 8, "r");
  c.rect(9, 6, 1, 8, "R");
  c.hline(2, 5, 12, "R");
  c.rect(6, 14, 4, 1, "R");
  c.px(3, 3, "#ffb3a8");
  c.px(4, 3, "#ffb3a8");
});

sprite("emblem_aapl", { w: 16, h: 16 }, (c) => {
  // round grey apple body
  c.circ(7, 9, 5, "s");
  c.circ(9, 10, 4, "s");
  c.rect(4, 10, 6, 3, "s");
  // top notch and bottom dimple
  c.px(7, 4, "_");
  c.px(7, 5, "_");
  c.px(10, 4, "_");
  c.px(8, 15, "_");
  // bite on the right
  c.circ(14, 8, 3, "_");
  c.circ(13, 11, 2, "_");
  // stem
  c.rect(7, 1, 1, 4, "T");
  c.px(8, 3, "T");
  // leaf
  c.poly([8, 3, 10, 1, 13, 2, 11, 4], "e");
  c.px(10, 2, "#8cf0c4");
  c.px(11, 3, "E");
  c.px(12, 2, "E");
  // light from the top left, shadow low right
  c.px(3, 7, "w");
  c.px(4, 6, "w");
  c.px(4, 8, "w");
  c.px(3, 9, "w");
  c.circ(10, 12, 2, "S");
  c.px(6, 14, "S");
  c.px(5, 13, "S");
});

sprite("emblem_nvda", { w: 16, h: 16 }, (c) => {
  // green chip with pins and a glowing die
  c.rect(4, 4, 8, 8, "k");
  c.rect(5, 5, 6, 6, "e");
  c.rect(5, 5, 6, 1, "#8cf0c4");
  c.rect(6, 6, 4, 4, "E");
  c.rect(7, 7, 2, 2, "h");
  c.px(7, 7, "#eafff5");
  // pins
  for (let i = 0; i < 3; i++) {
    const o = 5 + i * 2;
    c.hline(2, o, 2, "S");
    c.hline(12, o, 2, "S");
    c.vline(o, 2, 2, "S");
    c.vline(o, 12, 2, "S");
  }
  c.px(3, 4, "s");
  c.px(12, 11, "s");
});

sprite("emblem_spy", { w: 16, h: 16 }, (c) => {
  // blue rising bar chart
  c.hline(2, 13, 12, "U");
  c.rect(3, 9, 2, 4, "u");
  c.rect(6, 7, 2, 6, "u");
  c.rect(9, 8, 2, 5, "B");
  c.rect(12, 4, 2, 9, "u");
  c.hline(3, 9, 2, "#a8c4ff");
  c.hline(6, 7, 2, "#a8c4ff");
  c.hline(12, 4, 2, "#a8c4ff");
  // arrow
  c.line(3, 8, 12, 3, "c");
  c.line(4, 8, 12, 4, "#fff6e0");
  c.poly([12, 1, 15, 3, 12, 5], "c");
});

// ---------------------------------------------------------------- trinkets ---
sprite("coin", { w: 8, h: 8 }, `
  ..kkkk..
  .kggggk.
  kgggyggk
  kghggggk
  kggggggk
  kgggGggk
  .kGGGGk.
  ..kkkk..`);

sprite("spark", { w: 4, h: 4 }, `
  .c.
  cHc
  .c.
  .p.`);

// Useful review sheet, not shipped to the app.
sheet("gacha_sheet", ["machine", "card*", "emblem_*", "coin", "spark"], {
  pad: 2,
});
