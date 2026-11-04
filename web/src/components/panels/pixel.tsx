import { cn } from "@/lib/utils";

type GlyphName = "star" | "crown" | "spark" | "capsule" | "arrow";

/**
 * Small hand-drawn pixel glyphs. Drawn as 9x9 matrices so every icon keeps the
 * same optical size and stays crisp at any scale (`shapeRendering` is off by
 * default in SVG; `crispEdges` keeps the blocks from blurring).
 */
const GLYPHS: Record<GlyphName, readonly string[]> = {
  star: [
    "....#....",
    "...###...",
    "...###...",
    "#########",
    ".#######.",
    "..#####..",
    "..##.##..",
    ".##...##.",
    "#.......#",
  ],
  crown: [
    ".........",
    "#.......#",
    "##.....##",
    "###...###",
    "#########",
    "#########",
    "#.#.#.#.#",
    ".........",
    ".........",
  ],
  spark: [
    "....#....",
    "....#....",
    "....#....",
    ".#######.",
    "....#....",
    "....#....",
    "....#....",
    ".........",
    ".........",
  ],
  capsule: [
    "..#####..",
    ".#######.",
    "##.....##",
    "#..#....#",
    "#.......#",
    "#.......#",
    "##.....##",
    ".#######.",
    "..#####..",
  ],
  arrow: [
    ".......##",
    "......###",
    ".....###.",
    "....###..",
    "...###...",
    "..###....",
    ".###.....",
    "###......",
    "##.......",
  ],
};

export function PixelGlyph({
  name,
  className,
}: {
  name: GlyphName;
  className?: string;
}) {
  const rows = GLYPHS[name];

  return (
    <svg
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      fill="currentColor"
      className={cn("inline-block size-3 shrink-0", className)}
    >
      {rows.map((row, y) =>
        [...row].map((cell, x) =>
          cell === "#" ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
          ) : null,
        ),
      )}
    </svg>
  );
}

const STOCK_TONES: Record<string, { tile: string; label: string }> = {
  TSLAx: { tile: "bg-rose-400 text-rose-950", label: "TS" },
  AAPLx: { tile: "bg-zinc-200 text-zinc-900", label: "AP" },
  NVDAx: { tile: "bg-lime-300 text-lime-950", label: "NV" },
  SPYx: { tile: "bg-sky-300 text-sky-950", label: "SP" },
};

const FALLBACK_TONE = { tile: "bg-amber-300 text-amber-950", label: "xS" };

/**
 * Placeholder emblem for a tokenized stock: a chunky pixel sticker with a
 * two-letter ticker. Deliberately not a brand logo (no external assets).
 */
export function StockEmblem({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const tone = STOCK_TONES[symbol] ?? FALLBACK_TONE;
  const label =
    tone.label === "xS"
      ? symbol.replace(/x$/i, "").slice(0, 2).toUpperCase() || "xS"
      : tone.label;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-11 shrink-0 place-items-center border-2 border-black/70",
        "shadow-[inset_-3px_-3px_0_0_rgba(0,0,0,0.22),inset_2px_2px_0_0_rgba(255,255,255,0.28)] sm:size-12",
        tone.tile,
        className,
      )}
    >
      <span className="retro text-[9px] leading-none">{label}</span>
      <span className="absolute top-1 right-1 size-1 bg-black/30" />
    </span>
  );
}
