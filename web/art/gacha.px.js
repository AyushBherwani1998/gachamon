// Pixel art for the Gachamon UI: a bright 90s handheld look.
// Build: node <pxl>/bin/pxl.js build gacha.px.js
// Export: copy out/sprites/*.png -> ../public/sprites/

pal({
  k: "#2b1b45", // outline, deep plum
  d: "#1a1436",
  D: "#2a2054",
  n: "#2f2057", // card window
  m: "#a07bff", // candy purple
  M: "#7350d8", // purple shadow
  i: "#d6c4ff", // purple highlight
  q: "#ff86bd", // candy pink
  Q: "#d9548f", // pink shadow
  v: "#ffc9e0", // pink highlight
  a: "#35cdbd", // teal
  A: "#178f86", // teal shadow
  z: "#9cf0e4", // teal highlight
  x: "#fff6dc", // cream
  X: "#ecd8aa", // cream shadow
  l: "#62c1ff", // sky
  L: "#2f86d6", // sky shadow
  j: "#c6ebff", // sky highlight
  g: "#ffd24f", // gold
  G: "#d98e14", // gold shadow
  y: "#fff0a8", // gold highlight
  c: "#fff6e0",
  s: "#cfd6e6",
  S: "#8b95ad",
  w: "#eef2fa",
  P: "#8b5cf6",
  H: "#b79cff",
  h: "#e9e0ff",
  p: "#58379f",
  b: "#66d9ff",
  B: "#2a6f9e",
  e: "#3ddc97",
  E: "#1c8f60",
  r: "#ef5350",
  R: "#a6323c",
  o: "#ff8a7a",
  u: "#5b8cff",
  U: "#2f4fb8",
  t: "#8a5a3c",
  T: "#5c3a26",
});

// ------------------------------------------------------------------- logo ---
sprite("logo_wordmark", { w: 93, h: 15, outline: "k" }, (c) => {
  c.text(0, 0, "GACHA", "M", { scale: 3, gap: 1 });
  c.text(60, 0, "MON", "Q", { scale: 3, gap: 1 });
});

const star = (c, x, y, col, core) => {
  c.px(x, y - 2, col);
  c.px(x, y + 2, col);
  c.hline(x - 2, y, 5, col);
  c.px(x - 1, y - 1, col);
  c.px(x + 1, y - 1, col);
  c.px(x - 1, y + 1, col);
  c.px(x + 1, y + 1, col);
  c.px(x, y, core);
};

// 16x16 sealed mini pack, used in the header.
sprite("logo_icon", { w: 16, h: 16 }, (c) => {
  c.rect(2, 0, 12, 16, "k");
  c.rect(3, 1, 10, 14, "m");
  c.rect(3, 1, 10, 3, "M");
  for (let x = 3; x < 13; x += 2) c.vline(x, 1, 3, "i");
  c.hline(3, 4, 10, "k");
  c.rect(3, 5, 2, 8, "i");
  c.rect(3, 12, 10, 3, "M");
  for (let x = 3; x < 13; x += 2) c.vline(x, 12, 3, "i");
  c.hline(3, 11, 10, "k");
  c.rect(5, 5, 8, 6, "q");
  star(c, 9, 8, "x", "g");
});

// ------------------------------------------------------------------ packs ---
// 48x64 foil pack. The top strip is rows 0-9: the UI tears along row 10
// (15.625% of the height), so nothing important is drawn across that line.
const ribs = (c, y, h, light) => {
  for (let x = 3; x < 45; x += 2) c.vline(x, y, h, light);
};

const pack = (main, light, dark, hi, ink, label, extra = false) => (c) => {
  // silhouette
  c.rect(1, 0, 46, 64, "k");
  for (let x = 1; x < 47; x += 2) {
    c.px(x, 0, "_");
    c.px(x, 63, "_");
  }

  // crimped strips
  c.rect(2, 1, 44, 8, dark);
  ribs(c, 1, 8, light);
  c.hline(2, 9, 44, "k");
  c.rect(2, 56, 44, 6, dark);
  ribs(c, 56, 6, light);
  c.hline(2, 55, 44, "k");

  // foil body
  c.rect(2, 10, 44, 45, main);
  c.rect(2, 10, 2, 45, hi);
  c.rect(4, 10, 2, 45, light);
  c.rect(43, 10, 3, 45, dark);
  // diagonal sheen bands, clear of the logo plate
  c.poly([6, 10, 14, 10, 8, 16, 6, 16], light);
  c.poly([18, 10, 22, 10, 16, 16, 12, 16], light);
  c.poly([34, 10, 42, 10, 42, 13, 36, 16, 30, 16], light);
  c.poly([6, 50, 12, 50, 7, 55, 6, 55], light);
  c.poly([32, 55, 42, 49, 42, 54, 40, 55], light);

  // logo plate
  c.rect(3, 15, 42, 26, "k");
  c.rect(4, 16, 40, 24, "x");
  c.hline(4, 39, 40, "X");
  c.text(24, 17, "GACHA", "M", { scale: 2, gap: 1, align: "c" });
  c.text(24, 28, "MON", "Q", { scale: 2, gap: 1, align: "c" });
  star(c, 8, 33, ink, "x");
  star(c, 40, 33, ink, "x");

  // tier ribbon
  c.rect(6, 43, 36, 9, "k");
  c.rect(7, 44, 34, 7, dark);
  c.hline(7, 44, 34, light);
  c.text(24, 45, label, "x", { scale: 1, gap: 1, align: "c" });

  if (extra) {
    star(c, 8, 13, "x", "y");
    star(c, 40, 52, "x", "y");
    c.px(38, 12, "x");
    c.px(10, 52, "x");
  }
};

sprite("pack_rare", { w: 48, h: 64 }, pack("l", "j", "L", "x", "L", "RARE"));
sprite(
  "pack_legendary",
  { w: 48, h: 64 },
  pack("g", "y", "G", "x", "G", "LEGEND", true),
);

// ---------------------------------------------------------------- machine ---
// 80x104 cabinet: marquee, display window with both packs, handheld-style
// controls, chute. The chute is empty; packs are placed by the UI.
const miniPack = (c, x, y, main, light, dark, label) => {
  c.rect(x, y, 24, 31, "k");
  c.rect(x + 1, y + 1, 22, 3, dark);
  for (let i = 1; i < 23; i += 2) c.vline(x + i, y + 1, 3, light);
  c.hline(x + 1, y + 4, 22, "k");
  c.rect(x + 1, y + 5, 22, 21, main);
  c.rect(x + 1, y + 5, 2, 21, light);
  c.rect(x + 21, y + 5, 2, 21, dark);
  c.rect(x + 4, y + 8, 16, 11, "k");
  c.rect(x + 5, y + 9, 14, 9, "x");
  star(c, x + 12, y + 13, dark, "x");
  c.hline(x + 1, y + 26, 22, "k");
  c.rect(x + 1, y + 27, 22, 3, dark);
  for (let i = 1; i < 23; i += 2) c.vline(x + i, y + 27, 3, light);
  c.text(x + 12, y + 20, label, "k", { align: "c" });
};

sprite("machine", { w: 80, h: 104 }, (c) => {
  // feet
  c.rect(8, 98, 16, 6, "k");
  c.rect(9, 99, 14, 3, "Q");
  c.rect(56, 98, 16, 6, "k");
  c.rect(57, 99, 14, 3, "Q");

  // cabinet
  c.rect(2, 14, 76, 86, "k");
  c.rect(3, 15, 74, 84, "q");
  c.rect(3, 15, 3, 84, "v");
  c.rect(74, 15, 3, 84, "Q");
  c.hline(3, 97, 74, "Q");
  c.hline(3, 98, 74, "Q");

  // marquee
  c.rect(0, 0, 80, 18, "k");
  c.px(0, 0, "_");
  c.px(79, 0, "_");
  c.rect(1, 1, 78, 16, "m");
  c.hline(2, 1, 76, "i");
  c.hline(1, 16, 78, "M");
  c.rect(4, 3, 72, 12, "M");
  c.text(40, 4, "GACHAMON", "x", { scale: 2, gap: 1, align: "c" });
  for (const [x, y] of [[2, 3], [2, 8], [2, 13], [77, 3], [77, 8], [77, 13]]) {
    c.px(x, y, "y");
  }

  // display window
  c.rect(7, 21, 66, 44, "k");
  c.rect(8, 22, 64, 42, "x");
  c.rect(9, 23, 62, 40, "j");
  c.hline(9, 23, 62, "l");
  c.hline(9, 57, 62, "L");
  c.rect(9, 58, 62, 5, "l");
  c.hline(9, 58, 62, "j");
  miniPack(c, 13, 26, "l", "j", "L", "RARE");
  miniPack(c, 43, 26, "g", "y", "G", "LEG");
  // glass glints, kept to the gaps and corners
  c.poly([38, 24, 41, 24, 41, 28, 38, 33], "x");
  c.px(39, 36, "x");
  c.px(68, 25, "x");

  // control deck
  c.rect(7, 68, 66, 28, "k");
  c.rect(8, 69, 64, 26, "m");
  c.hline(8, 69, 64, "i");
  c.hline(8, 94, 64, "M");

  // d-pad
  c.rect(14, 77, 11, 5, "k");
  c.rect(17, 74, 5, 11, "k");
  c.rect(15, 78, 9, 3, "D");
  c.rect(18, 75, 3, 9, "D");
  c.px(19, 79, "S");

  // chute: a dark bay with a flap
  c.rect(28, 72, 24, 21, "k");
  c.rect(29, 73, 22, 19, "D");
  c.rect(30, 74, 20, 4, "M");
  c.hline(30, 74, 20, "i");
  c.hline(30, 77, 20, "k");
  c.text(40, 83, "OUT", "m", { align: "c" });

  // coin slot and teal button
  c.rect(56, 72, 12, 10, "k");
  c.rect(57, 73, 10, 8, "s");
  c.hline(57, 73, 10, "w");
  c.rect(59, 76, 6, 2, "k");
  c.circ(61, 88, 4, "k");
  c.circ(61, 88, 3, "a");
  c.px(60, 86, "z");
  c.px(59, 87, "z");
  c.circ(68, 85, 2, "k");
  c.px(68, 85, "A");
});

// ------------------------------------------------------------------ cards ---
// 24x32 faces. The 16x16 emblem window is at (4, 6).
const cardFace = (frame, frameLight, frameDark, inner, gem, extra = false) => (c) => {
  c.rect(0, 0, 24, 32, "k");
  c.rect(1, 1, 22, 30, frame);
  c.rect(1, 1, 22, 2, frameLight);
  c.rect(3, 3, 18, 26, "k");
  c.rect(4, 4, 16, 24, inner);
  c.rect(4, 4, 16, 1, frameDark);
  c.rect(4, 4, 1, 24, frameDark);
  c.rect(4, 6, 16, 16, "n");
  c.rect(4, 6, 16, 1, "D");
  c.rect(4, 23, 16, 5, frameDark);
  c.rect(5, 24, 14, 3, frame);
  c.hline(6, 25, 12, frameLight);
  c.px(11, 25, gem);
  c.px(12, 26, gem);
  c.px(5, 1, frameLight);
  c.px(8, 2, frameDark);
  c.px(15, 2, frameDark);
  c.px(18, 1, frameLight);
  c.px(1, 1, frameLight);
  c.px(22, 1, frameLight);
  c.px(1, 30, frameDark);
  c.px(22, 30, frameDark);
  c.vline(1, 3, 26, frameLight);
  c.hline(3, 30, 18, frameDark);
  c.vline(22, 3, 26, frameDark);
  c.px(5, 5, "#ffffff77");
  if (extra) {
    c.px(2, 2, "x");
    c.px(3, 3, "x");
    c.px(21, 2, "x");
    c.px(20, 3, "x");
    c.px(7, 1, "x");
    c.px(16, 1, "x");
    c.px(12, 30, "y");
  }
};

sprite("card_rare", { w: 24, h: 32 }, cardFace("l", "j", "L", "n", "x"));
sprite("card_legendary", { w: 24, h: 32 }, cardFace("g", "y", "G", "n", "x", true));

// --------------------------------------------------------------- emblems ---
// 16x16, transparent background so the card window shows through.
sprite("emblem_tsla", { w: 16, h: 16 }, (c) => {
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
  c.circ(7, 9, 5, "s");
  c.circ(9, 10, 4, "s");
  c.rect(4, 10, 6, 3, "s");
  c.px(7, 4, "_");
  c.px(7, 5, "_");
  c.px(10, 4, "_");
  c.px(8, 15, "_");
  c.circ(14, 8, 3, "_");
  c.circ(13, 11, 2, "_");
  c.rect(7, 1, 1, 4, "T");
  c.px(8, 3, "T");
  c.poly([8, 3, 10, 1, 13, 2, 11, 4], "e");
  c.px(10, 2, "#8cf0c4");
  c.px(11, 3, "E");
  c.px(12, 2, "E");
  c.px(3, 7, "w");
  c.px(4, 6, "w");
  c.px(4, 8, "w");
  c.px(3, 9, "w");
  c.circ(10, 12, 2, "S");
  c.px(6, 14, "S");
  c.px(5, 13, "S");
});

sprite("emblem_nvda", { w: 16, h: 16 }, (c) => {
  c.rect(4, 4, 8, 8, "k");
  c.rect(5, 5, 6, 6, "e");
  c.rect(5, 5, 6, 1, "#8cf0c4");
  c.rect(6, 6, 4, 4, "E");
  c.rect(7, 7, 2, 2, "h");
  c.px(7, 7, "#eafff5");
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
  c.hline(2, 13, 12, "U");
  c.rect(3, 9, 2, 4, "u");
  c.rect(6, 7, 2, 6, "u");
  c.rect(9, 8, 2, 5, "B");
  c.rect(12, 4, 2, 9, "u");
  c.hline(3, 9, 2, "#a8c4ff");
  c.hline(6, 7, 2, "#a8c4ff");
  c.hline(12, 4, 2, "#a8c4ff");
  c.line(3, 8, 12, 3, "c");
  c.line(4, 8, 12, 4, "#fff6e0");
  c.poly([12, 1, 15, 3, 12, 5], "c");
});

// ---------------------------------------------------------------- trinkets ---
sprite("coin", { w: 8, h: 8 }, `
  ..kkkk..
  .kggggk.
  kgggyggk
  kgyggggk
  kggggggk
  kgggGggk
  .kGGGGk.
  ..kkkk..`);

sprite("spark", { w: 4, h: 4 }, `
  .x.
  xgx
  .x.
  .G.`);

// Review sheet, not shipped to the app.
sheet("gacha_sheet", ["logo_*", "machine", "pack_*", "card_*", "coin", "spark"], {
  pad: 2,
});
