// Original pixel-art for the magical chocolate factory, drawn CRISP (scanline
// fills, no anti-aliasing) directly in native world coordinates at 2× the old
// resolution (64×32 tiles) so every object carries real detail. The whole
// canvas is scaled nearest-neighbor by the camera → pixels stay sharp.
//
// Palette is deliberately NOT all-brown: cream plaster walls, brass/copper,
// burgundy, emerald/teal machines, colored screens and candy accents give the
// room strong value contrast and warmth. Light comes from the upper-left.

import { TILE_H, TILE_W, gridToScreen } from "./iso";
import type { FurnitureType } from "./room";

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

export const PAL = {
  // floor — warm chocolate + caramel checker (inviting, not gloomy)
  floorA: "#74502f", floorB: "#916a42", floorSeam: "#402a18", floorHi: "#a67c4c",
  creamTile: "#ddc99e", creamTileHi: "#f2e4c2", creamSeam: "#b8a06f",
  plate: "#6b727b", plateHi: "#949ba4", plateSh: "#474d55", rivet: "#c8cdd3",
  // metals
  brass: "#caa04a", brassHi: "#f1d78c", brassSh: "#8a6c2c", brassDk: "#5c4820",
  copper: "#c07a44", copperHi: "#e8ac78", copperSh: "#7c4c26", copperDk: "#5a3418",
  gold: "#ffcf5c", goldHi: "#ffe9a8",
  // chocolate
  choc: "#5a3418", chocHi: "#8a5028", chocLite: "#a86a34", chocDark: "#341d0e",
  chocShine: "#cf9350", chocMilk: "#8a5a2e",
  // walls
  cream: "#d8c49a", creamHi: "#ecdcb4", creamSh: "#b7a077", creamDk: "#9c855e",
  wainscot: "#4a2f1c", wainscotHi: "#623e26", wainscotDk: "#331e11",
  // accents
  wine: "#7a2438", wineHi: "#a13a54", wineDk: "#4e1725",
  green: "#2f9d6b", greenHi: "#5fca92", greenDk: "#1c6244",
  teal: "#2fa39d", tealHi: "#63d2cb", tealDk: "#1a635f",
  // glass + screens
  glass: "#a9d2df", glassHi: "#e9f6fb", glassDk: "#6f9aa8",
  screenBg: "#12332f", screenTeal: "#5ce0cf", screenAmber: "#f4c452", screenPink: "#f284b4", screenGreen: "#8fe6a0",
  // candy
  cPink: "#ef6fa8", cRasp: "#d23b6b", cMint: "#8fe6c0", cOrange: "#f2913c", cViolet: "#9b6fd0", cRed: "#e0503f", cYellow: "#f4d44a",
  // neutrals + light
  metal: "#7a8794", metalHi: "#b2bcc6", metalSh: "#49525c", dark: "#20140c", ink: "#160d07",
  glow: "#ffd47a",
};

// ── crisp convex polygon fill (scanline) ──
export function fillPoly(ctx: Ctx, pts: Pt[], color: string) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  minY = Math.round(minY); maxY = Math.round(maxY);
  ctx.fillStyle = color;
  for (let y = minY; y < maxY; y++) {
    const yc = y + 0.5;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) {
        const x = a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (x < xl) xl = x; if (x > xr) xr = x;
      }
    }
    if (xr >= xl) { const l = Math.round(xl); ctx.fillRect(l, y, Math.max(1, Math.round(xr) - l), 1); }
  }
}

const px = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function fillLine(ctx: Ctx, a: Pt, b: Pt, color: string) {
  ctx.fillStyle = color;
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 1, 1);
  }
}

// Base rhombus corners (native screen) for an fw×fh footprint at (gx,gy).
function baseCorners(gx: number, gy: number, fw: number, fh: number, ox: number, oy: number) {
  const t = gridToScreen(gx, gy, 0, ox, oy);
  const r = gridToScreen(gx + fw - 1, gy, 0, ox, oy);
  const f = gridToScreen(gx + fw - 1, gy + fh - 1, 0, ox, oy);
  const l = gridToScreen(gx, gy + fh - 1, 0, ox, oy);
  return {
    top: { x: t.x, y: t.y - TILE_H / 2 },
    right: { x: r.x + TILE_W / 2, y: r.y },
    front: { x: f.x, y: f.y + TILE_H / 2 },
    left: { x: l.x - TILE_W / 2, y: l.y },
  };
}

// A raised iso box over an fw×fh footprint. Light from upper-left → top bright,
// left face mid, right face dark. Optional crisp outline.
export function isoBox(ctx: Ctx, gx: number, gy: number, fw: number, fh: number, H: number, top: string, left: string, right: string, ox: number, oy: number, outline?: string) {
  const b = baseCorners(gx, gy, fw, fh, ox, oy);
  const up = (p: Pt) => ({ x: p.x, y: p.y - H });
  fillPoly(ctx, [b.left, b.front, up(b.front), up(b.left)], left);
  fillPoly(ctx, [b.front, b.right, up(b.right), up(b.front)], right);
  fillPoly(ctx, [up(b.top), up(b.right), up(b.front), up(b.left)], top);
  if (outline) {
    fillLine(ctx, up(b.left), up(b.top), outline); fillLine(ctx, up(b.top), up(b.right), outline);
    fillLine(ctx, up(b.left), b.left, outline); fillLine(ctx, up(b.front), b.front, outline); fillLine(ctx, up(b.right), b.right, outline);
    fillLine(ctx, b.left, b.front, outline); fillLine(ctx, b.front, b.right, outline);
  }
  return b;
}

// ── floor tile (per cell) ──
export function drawFloorTile(ctx: Ctx, gx: number, gy: number, variant: number, ox: number, oy: number) {
  const c = gridToScreen(gx, gy, 0, ox, oy);
  const top = { x: c.x, y: c.y - TILE_H / 2 };
  const right = { x: c.x + TILE_W / 2, y: c.y };
  const bot = { x: c.x, y: c.y + TILE_H / 2 };
  const left = { x: c.x - TILE_W / 2, y: c.y };

  if (variant === 2) {
    // cream inset tile with brass border — bright accent
    fillPoly(ctx, [top, right, bot, left], PAL.creamSeam);
    const s = 0.82;
    const it = { x: c.x, y: c.y - (TILE_H / 2) * s }, ir = { x: c.x + (TILE_W / 2) * s, y: c.y };
    const ib = { x: c.x, y: c.y + (TILE_H / 2) * s }, il = { x: c.x - (TILE_W / 2) * s, y: c.y };
    fillPoly(ctx, [it, ir, ib, il], PAL.creamTile);
    fillLine(ctx, il, it, PAL.creamTileHi);
    px(ctx, c.x - 1, c.y - 1, 2, 2, PAL.brass);
  } else if (variant === 3) {
    // metal maintenance plate with rivets
    fillPoly(ctx, [top, right, bot, left], PAL.plate);
    fillLine(ctx, top, left, PAL.plateHi);
    fillLine(ctx, top, right, PAL.plateSh); fillLine(ctx, left, bot, PAL.plateSh); fillLine(ctx, right, bot, PAL.plateSh);
    for (const [dx, dy] of [[-16, 0], [16, 0], [0, -6], [0, 6]]) px(ctx, c.x + dx, c.y + dy, 1, 1, PAL.rivet);
  } else {
    fillPoly(ctx, [top, right, bot, left], variant === 1 ? PAL.floorB : PAL.floorA);
    fillLine(ctx, top, left, PAL.floorHi);
    fillLine(ctx, top, right, PAL.floorSeam); fillLine(ctx, left, bot, PAL.floorSeam); fillLine(ctx, right, bot, PAL.floorSeam);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  WALLS — cream plaster + chocolate wainscot + brass rails, densely detailed.
//  Drawn ONCE into the background cache (static). Light from upper-left.
// ══════════════════════════════════════════════════════════════════════════
export const WALL_H = 64;  // wall height (short, but tall enough for architecture)
const WH = WALL_H;
const WAINSCOT = 24;       // lower chocolate-wood band

export function drawWalls(ctx: Ctx, cols: number, rows: number, ox: number, oy: number) {
  const bTop = { x: gridToScreen(0, 0, 0, ox, oy).x, y: gridToScreen(0, 0, 0, ox, oy).y - TILE_H / 2 };
  const rCorner = { x: gridToScreen(cols - 1, 0, 0, ox, oy).x + TILE_W / 2, y: gridToScreen(cols - 1, 0, 0, ox, oy).y };
  const lCorner = { x: gridToScreen(0, rows - 1, 0, ox, oy).x - TILE_W / 2, y: gridToScreen(0, rows - 1, 0, ox, oy).y };

  wallFace(ctx, bTop, rCorner, false); // right-facing wall (lit)
  wallFace(ctx, bTop, lCorner, true);  // left-facing wall (shadowed)

  // ── decor along the RIGHT wall (the long one) ──
  decoWindow(ctx, bTop, rCorner, 0.10);
  decoLamp(ctx, bTop, rCorner, 0.20);
  decoGauge(ctx, bTop, rCorner, 0.28, 0.7);
  decoShelf(ctx, bTop, rCorner, 0.35);
  decoGoldenTicket(ctx, bTop, rCorner, 0.44);
  decoWindow(ctx, bTop, rCorner, 0.53);
  decoPipe(ctx, bTop, rCorner, 0.60);
  decoGauge(ctx, bTop, rCorner, 0.66, -0.5);
  decoLamp(ctx, bTop, rCorner, 0.74);
  decoFramed(ctx, bTop, rCorner, 0.83);
  decoValve(ctx, bTop, rCorner, 0.92);
  decoCandyTubeStatic(ctx, bTop, rCorner, 0.16, 0.5);

  // ── decor along the LEFT wall (shorter) ──
  decoPipe(ctx, bTop, lCorner, 0.14, true);
  decoLamp(ctx, bTop, lCorner, 0.30, true);
  decoShelf(ctx, bTop, lCorner, 0.45, true);
  decoGauge(ctx, bTop, lCorner, 0.60, 0.3, true);
  decoWindow(ctx, bTop, lCorner, 0.78, true);
}

function wallFace(ctx: Ctx, a: Pt, b: Pt, shadow: boolean) {
  const up = (p: Pt, h: number) => ({ x: p.x, y: p.y - h });
  const cream = shadow ? PAL.creamSh : PAL.cream;
  const creamHi = shadow ? PAL.creamDk : PAL.creamHi;
  const wains = shadow ? PAL.wainscotDk : PAL.wainscot;
  // upper cream plaster
  fillPoly(ctx, [up(a, WAINSCOT), up(b, WAINSCOT), up(b, WH), up(a, WH)], cream);
  // subtle top highlight strip
  fillPoly(ctx, [up(a, WH), up(b, WH), up(b, WH - 2), up(a, WH - 2)], creamHi);
  // lower chocolate wainscot
  fillPoly(ctx, [a, b, up(b, WAINSCOT), up(a, WAINSCOT)], wains);
  fillPoly(ctx, [up(a, WAINSCOT), up(b, WAINSCOT), up(b, WAINSCOT - 2), up(a, WAINSCOT - 2)], shadow ? PAL.wainscot : PAL.wainscotHi);
  // brass chair-rail between wainscot and plaster + brass cornice at very top
  fillPoly(ctx, [up(a, WAINSCOT + 2), up(b, WAINSCOT + 2), up(b, WAINSCOT), up(a, WAINSCOT)], shadow ? PAL.brassSh : PAL.brass);
  fillPoly(ctx, [up(a, WH), up(b, WH), up(b, WH + 1), up(a, WH + 1)], PAL.brassSh);
  // faint vertical pilasters on the cream
  const len = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.floor(len / 52);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    for (let k = WAINSCOT + 3; k < WH - 2; k++) px(ctx, x, y - k, 1, 1, shadow ? PAL.creamDk : PAL.creamSh);
  }
}

const onWall = (a: Pt, b: Pt, t: number, h: number) => ({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t - h) });

function decoWindow(ctx: Ctx, a: Pt, b: Pt, t: boolean | number, flip?: boolean) {
  const tt = typeof t === "number" ? t : 0.5; void flip;
  const p = onWall(a, b, tt, WH - 6);
  px(ctx, p.x - 7, p.y, 14, 30, PAL.brassSh);          // frame
  px(ctx, p.x - 6, p.y + 1, 12, 28, PAL.tealDk);       // glass recess
  // glowing panes
  for (let r = 0; r < 4; r++) for (let cc = 0; cc < 2; cc++) px(ctx, p.x - 5 + cc * 6, p.y + 2 + r * 7, 5, 6, r + cc & 1 ? PAL.teal : PAL.tealHi);
  px(ctx, p.x - 1, p.y + 1, 1, 28, PAL.brass);         // mullion
  px(ctx, p.x - 6, p.y + 14, 12, 1, PAL.brass);        // transom
  px(ctx, p.x - 8, p.y - 2, 16, 2, PAL.brass);         // lintel
}

function decoLamp(ctx: Ctx, a: Pt, b: Pt, t: number, _flip?: boolean) {
  const p = onWall(a, b, t, WH - 4);
  px(ctx, p.x - 2, p.y, 4, 3, PAL.brassSh);            // bracket
  px(ctx, p.x - 4, p.y + 3, 8, 4, PAL.brass);          // shade
  px(ctx, p.x - 4, p.y + 3, 8, 1, PAL.brassHi);
  px(ctx, p.x - 3, p.y + 7, 6, 2, PAL.goldHi);         // bulb
  // warm glow pool spilling down the cream wall (baked, translucent)
  ctx.fillStyle = "rgba(255,212,122,0.16)";
  for (let i = 0; i < 22; i++) { const w = 12 - Math.floor(i / 3); px(ctx, p.x - w / 2, p.y + 8 + i, w, 1, "rgba(255,212,122,0.14)"); }
}

function decoGauge(ctx: Ctx, a: Pt, b: Pt, t: number, needle: number, _flip?: boolean) {
  const p = onWall(a, b, t, WH - 22);
  px(ctx, p.x - 6, p.y - 6, 12, 12, PAL.brassSh);
  fillPoly(ctx, [{ x: p.x, y: p.y - 6 }, { x: p.x + 6, y: p.y }, { x: p.x, y: p.y + 6 }, { x: p.x - 6, y: p.y }], PAL.brass);
  fillPoly(ctx, [{ x: p.x, y: p.y - 5 }, { x: p.x + 5, y: p.y }, { x: p.x, y: p.y + 5 }, { x: p.x - 5, y: p.y }], PAL.creamTile);
  // needle
  const nx = Math.round(Math.cos(needle) * 4), ny = Math.round(Math.sin(needle) * 4);
  fillLine(ctx, { x: p.x, y: p.y }, { x: p.x + nx, y: p.y + ny }, PAL.wine);
  px(ctx, p.x, p.y, 1, 1, PAL.ink);
  // ticks
  px(ctx, p.x, p.y - 4, 1, 1, PAL.brassSh); px(ctx, p.x + 4, p.y, 1, 1, PAL.brassSh); px(ctx, p.x - 4, p.y, 1, 1, PAL.brassSh);
}

function decoPipe(ctx: Ctx, a: Pt, b: Pt, t: number, _flip?: boolean) {
  const top = onWall(a, b, t, WH - 4), bot = onWall(a, b, t, 2);
  for (let y = top.y; y <= bot.y; y++) { px(ctx, top.x - 2, y, 4, 1, PAL.copper); px(ctx, top.x - 2, y, 1, 1, PAL.copperHi); px(ctx, top.x + 1, y, 1, 1, PAL.copperSh); }
  for (let j = 0; j < 3; j++) px(ctx, top.x - 3, top.y + 8 + j * 16, 6, 2, PAL.brass);   // flanges
}

function decoShelf(ctx: Ctx, a: Pt, b: Pt, t: number, _flip?: boolean) {
  const p = onWall(a, b, t, WH - 16);
  px(ctx, p.x - 12, p.y, 24, 2, PAL.wainscotHi);       // shelf plank
  px(ctx, p.x - 12, p.y + 2, 24, 1, PAL.wainscotDk);
  // little bottles / jars of colored syrup
  const cols = [PAL.cPink, PAL.cMint, PAL.cOrange, PAL.cViolet, PAL.tealHi, PAL.cYellow];
  for (let i = 0; i < 6; i++) { const bx = p.x - 11 + i * 4; px(ctx, bx, p.y - 5, 3, 5, PAL.glass); px(ctx, bx, p.y - 3, 3, 3, cols[i]); px(ctx, bx, p.y - 5, 1, 5, PAL.glassHi); }
}

function decoFramed(ctx: Ctx, a: Pt, b: Pt, t: number) {
  const p = onWall(a, b, t, WH - 14);
  px(ctx, p.x - 8, p.y - 8, 16, 14, PAL.brassSh);      // frame
  px(ctx, p.x - 7, p.y - 7, 14, 12, PAL.creamTile);    // diagram paper
  // a little chocolate-mould schematic in wine ink
  px(ctx, p.x - 5, p.y - 5, 10, 1, PAL.wine);
  px(ctx, p.x - 5, p.y - 2, 6, 1, PAL.wine);
  px(ctx, p.x - 5, p.y + 1, 8, 1, PAL.wine);
  px(ctx, p.x + 2, p.y - 4, 3, 3, PAL.copper);
}

function decoValve(ctx: Ctx, a: Pt, b: Pt, t: number) {
  const p = onWall(a, b, t, WH - 20);
  px(ctx, p.x - 1, p.y - 1, 2, 10, PAL.copperSh);      // stem to floor
  // wheel
  px(ctx, p.x - 5, p.y - 1, 11, 2, PAL.brass);
  px(ctx, p.x - 1, p.y - 5, 2, 11, PAL.brass);
  px(ctx, p.x - 1, p.y - 1, 2, 2, PAL.brassHi);
}

function decoGoldenTicket(ctx: Ctx, a: Pt, b: Pt, t: number) {
  const p = onWall(a, b, t, WH - 12);
  px(ctx, p.x - 10, p.y - 7, 20, 14, PAL.wainscotDk);  // dark shadow-box frame
  px(ctx, p.x - 9, p.y - 6, 18, 12, PAL.brassSh);
  px(ctx, p.x - 8, p.y - 5, 16, 10, PAL.gold);         // ticket
  px(ctx, p.x - 7, p.y - 4, 14, 8, PAL.goldHi);
  px(ctx, p.x - 6, p.y - 3, 12, 1, PAL.gold);          // engraved lines
  px(ctx, p.x - 6, p.y - 1, 9, 1, PAL.gold);
  px(ctx, p.x - 6, p.y + 1, 11, 1, PAL.gold);
  px(ctx, p.x + 4, p.y - 4, 2, 2, PAL.brassSh);        // seal
}

// A static candy tube segment on the wall (the animated one is drawn per-frame).
function decoCandyTubeStatic(ctx: Ctx, a: Pt, b: Pt, t0: number, t1: number) {
  const p0 = onWall(a, b, t0, WH - 30), p1 = onWall(a, b, t1, WH - 30);
  for (let x = p0.x; x <= p1.x; x++) { const y = p0.y + Math.round((p1.y - p0.y) * ((x - p0.x) / Math.max(1, p1.x - p0.x))); px(ctx, x, y - 2, 1, 5, PAL.glass); px(ctx, x, y - 2, 1, 1, PAL.glassHi); px(ctx, x, y + 3, 1, 1, PAL.glassDk); }
}

// ── per-frame ambient overlay on the walls (candy flowing through a tube) ──
export function drawAmbient(ctx: Ctx, tick: number, cols: number, rows: number, ox: number, oy: number) {
  const bTop = { x: gridToScreen(0, 0, 0, ox, oy).x, y: gridToScreen(0, 0, 0, ox, oy).y - TILE_H / 2 };
  const rCorner = { x: gridToScreen(cols - 1, 0, 0, ox, oy).x + TILE_W / 2, y: gridToScreen(cols - 1, 0, 0, ox, oy).y };
  const p0 = onWall(bTop, rCorner, 0.16, WH - 30), p1 = onWall(bTop, rCorner, 0.50, WH - 30);
  const candies = [PAL.cPink, PAL.cMint, PAL.cOrange, PAL.cViolet, PAL.cYellow];
  for (let i = 0; i < 5; i++) {
    const ph = ((tick / 90 + i * 0.2) % 1);
    const x = Math.round(p0.x + (p1.x - p0.x) * ph);
    const y = Math.round(p0.y + (p1.y - p0.y) * ((x - p0.x) / Math.max(1, p1.x - p0.x)));
    px(ctx, x - 1, y - 1, 2, 2, candies[i]);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  FURNITURE — drawn each frame in world coords; several animate via `tick`.
// ══════════════════════════════════════════════════════════════════════════
export function drawFurniture(ctx: Ctx, type: FurnitureType, gx: number, gy: number, fw: number, fh: number, ox: number, oy: number, tick: number) {
  const b = baseCorners(gx, gy, fw, fh, ox, oy);
  const cx = (b.left.x + b.right.x) / 2;
  const cy = (b.top.y + b.front.y) / 2;

  switch (type) {
    // ── THE CHOCOLATE REACTOR ──
    case "vat": {
      isoBox(ctx, gx, gy, fw, fh, 46, PAL.copperHi, PAL.copperSh, PAL.copper, ox, oy, PAL.copperDk);
      // brass bands + rivets on the body
      for (const yy of [cy - 4, cy + 8, cy + 20]) { px(ctx, cx - 40, yy, 80, 3, PAL.brass); px(ctx, cx - 40, yy, 80, 1, PAL.brassHi); for (let r = -34; r <= 34; r += 12) px(ctx, cx + r, yy + 1, 1, 1, PAL.brassDk); }
      // glass inspection window with visible chocolate + level line
      px(ctx, cx + 10, cy + 6, 14, 16, PAL.brassSh); px(ctx, cx + 11, cy + 7, 12, 14, PAL.glassDk);
      px(ctx, cx + 11, cy + 12, 12, 9, PAL.choc); px(ctx, cx + 11, cy + 12, 12, 1, PAL.chocShine); px(ctx, cx + 12, cy + 8, 2, 12, PAL.glassHi);
      // valve + spout on the front-left
      px(ctx, cx - 26, cy + 10, 4, 8, PAL.brass); px(ctx, cx - 28, cy + 16, 8, 3, PAL.brassSh); px(ctx, cx - 24, cy + 8, 3, 3, PAL.brassHi);
      // rim + bubbling chocolate pool on top
      const topY = cy - 46;
      fillPoly(ctx, [{ x: cx, y: topY - 22 }, { x: cx + 44, y: topY }, { x: cx, y: topY + 22 }, { x: cx - 44, y: topY }], PAL.brass);
      fillPoly(ctx, [{ x: cx, y: topY - 18 }, { x: cx + 36, y: topY }, { x: cx, y: topY + 18 }, { x: cx - 36, y: topY }], PAL.brassSh);
      fillPoly(ctx, [{ x: cx, y: topY - 15 }, { x: cx + 30, y: topY }, { x: cx, y: topY + 15 }, { x: cx - 30, y: topY }], PAL.choc);
      fillPoly(ctx, [{ x: cx, y: topY - 12 }, { x: cx + 24, y: topY }, { x: cx, y: topY + 12 }, { x: cx - 24, y: topY }], PAL.chocMilk);
      fillPoly(ctx, [{ x: cx - 6, y: topY - 4 }, { x: cx + 6, y: topY - 2 }, { x: cx, y: topY + 3 }, { x: cx - 10, y: topY }], PAL.chocShine);
      for (let i = 0; i < 4; i++) { const ph = (tick / 26 + i * 0.27) % 1; px(ctx, cx - 14 + i * 9, topY - 2 - ph * 9, 2, 2, ph < 0.7 ? PAL.chocShine : PAL.chocLite); }
      // little steam puff
      if ((tick >> 5) % 3 === 0) px(ctx, cx - 2, topY - 16, 3, 3, "rgba(255,255,255,0.14)");
      break;
    }
    // ── THE INVENTING MACHINE (most colorful) ──
    case "invention": {
      isoBox(ctx, gx, gy, fw, fh, 40, PAL.tealHi, PAL.tealDk, PAL.teal, ox, oy, "#123f3b");
      // brass frame around a bank of glass tubes with candy travelling up
      px(ctx, cx - 26, cy - 76, 52, 4, PAL.brass); px(ctx, cx - 26, cy - 76, 52, 1, PAL.brassHi);
      px(ctx, cx - 26, cy - 40, 52, 3, PAL.brassSh);
      const tubes = [PAL.cPink, PAL.cMint, PAL.cYellow, PAL.cViolet];
      for (let i = 0; i < 4; i++) {
        const tx = cx - 20 + i * 13;
        px(ctx, tx - 3, cy - 74, 6, 36, PAL.glassDk); px(ctx, tx - 2, cy - 74, 4, 36, PAL.glass); px(ctx, tx - 2, cy - 74, 1, 36, PAL.glassHi);
        for (let k = 0; k < 2; k++) { const p = ((tick / 24 + i * 0.3 + k * 0.5) % 1); px(ctx, tx - 1, cy - 42 - p * 30, 3, 4, tubes[i]); }
      }
      // gauges + blinking indicator + knobs on the body
      px(ctx, cx - 22, cy - 30, 8, 8, PAL.brass); px(ctx, cx - 21, cy - 29, 6, 6, PAL.creamTile); px(ctx, cx - 18, cy - 26, 2, 1, PAL.wine);
      px(ctx, cx + 14, cy - 30, 6, 6, (tick >> 4) % 2 ? PAL.cRed : PAL.wineDk);   // blinking light
      px(ctx, cx - 4, cy - 14, 7, 7, (tick >> 3) % 2 ? PAL.brassHi : PAL.brass);  // spinning knob
      px(ctx, cx + 8, cy - 14, 5, 5, PAL.copper);
      // little output tray with a wrapped sweet
      px(ctx, cx - 30, cy + 10, 12, 4, PAL.metalSh); px(ctx, cx - 28, cy + 8, 5, 3, PAL.cOrange);
      break;
    }
    // ── THE CONTROL CONSOLE ──
    case "control": {
      isoBox(ctx, gx, gy, fw, fh, 22, PAL.metalHi, PAL.metalSh, PAL.metal, ox, oy, PAL.dark);
      // slanted desk face + three monitors
      const sy = cy - 52;
      px(ctx, cx - 26, sy, 52, 3, PAL.brass);
      const scr = [PAL.screenTeal, PAL.screenAmber, PAL.screenGreen];
      for (let i = 0; i < 3; i++) {
        const mx = cx - 24 + i * 18;
        px(ctx, mx, sy + 3, 16, 14, PAL.dark); px(ctx, mx + 1, sy + 4, 14, 12, PAL.screenBg);
        // little graph / waveform per screen
        for (let k = 0; k < 6; k++) { const h = 1 + ((tick / 5 + k * 2 + i * 3) | 0) % 6; px(ctx, mx + 2 + k * 2, sy + 15 - h, 1, h, scr[i]); }
      }
      // button/switch bank on the desktop
      const topY = cy - 22;
      for (let i = 0; i < 6; i++) px(ctx, cx - 20 + i * 7, topY + 2, 4, 3, [PAL.cRed, PAL.cYellow, PAL.green, PAL.teal, PAL.cPink, PAL.brass][i]);
      px(ctx, cx - 8, topY + 8, 16, 3, PAL.metalSh); px(ctx, cx - 6 + ((tick >> 4) % 2) * 8, topY + 8, 4, 3, PAL.brassHi); // lever
      break;
    }
    // ── CHOCOLATE CONVEYOR ──
    case "conveyor": {
      isoBox(ctx, gx, gy, fw, fh, 10, PAL.metalSh, PAL.dark, PAL.metal, ox, oy, PAL.ink);
      const spanL = { x: b.left.x + 6, y: b.left.y - 10 }, spanR = { x: b.right.x - 6, y: b.right.y - 10 };
      // rollers at the ends
      px(ctx, spanL.x - 3, spanL.y - 2, 3, 6, PAL.brass); px(ctx, spanR.x, spanR.y - 2, 3, 6, PAL.brass);
      // belt + scrolling slats + wrapped chocolates
      for (let i = 0; i < 14; i++) {
        const p = ((tick / 30 + i / 14) % 1);
        const x = spanL.x + (spanR.x - spanL.x) * p, y = spanL.y + (spanR.y - spanL.y) * p;
        px(ctx, x - 1, y - 1, 2, 2, PAL.metalHi);
        if (i % 4 === 0) { px(ctx, x - 4, y - 7, 8, 4, PAL.choc); px(ctx, x - 4, y - 7, 8, 1, PAL.chocShine); px(ctx, x - 4, y - 7, 2, 4, PAL.gold); } // foil-wrapped bar
        else if (i % 4 === 2) { px(ctx, x - 2, y - 5, 4, 3, [PAL.cPink, PAL.cMint, PAL.cYellow][(i / 2) % 3 | 0]); } // wrapped sweet
      }
      break;
    }
    // ── FUDGE MIXING STATION ──
    case "fudge": {
      isoBox(ctx, gx, gy, fw, fh, 34, PAL.metalHi, PAL.metalSh, PAL.metal, ox, oy, PAL.dark);
      for (const yy of [cy, cy + 12]) px(ctx, cx - 30, yy, 60, 2, PAL.brass);
      // mixing drum + rotating paddle + chocolate
      const topY = cy - 34;
      fillPoly(ctx, [{ x: cx, y: topY - 16 }, { x: cx + 30, y: topY }, { x: cx, y: topY + 16 }, { x: cx - 30, y: topY }], PAL.brass);
      fillPoly(ctx, [{ x: cx, y: topY - 12 }, { x: cx + 24, y: topY }, { x: cx, y: topY + 12 }, { x: cx - 24, y: topY }], PAL.chocHi);
      fillPoly(ctx, [{ x: cx, y: topY - 9 }, { x: cx + 18, y: topY }, { x: cx, y: topY + 9 }, { x: cx - 18, y: topY }], PAL.choc);
      const a = tick / 9;
      fillLine(ctx, { x: cx, y: topY }, { x: cx + Math.round(Math.cos(a) * 14), y: topY + Math.round(Math.sin(a) * 7) }, PAL.brassHi);
      fillLine(ctx, { x: cx, y: topY }, { x: cx - Math.round(Math.cos(a) * 14), y: topY - Math.round(Math.sin(a) * 7) }, PAL.brass);
      px(ctx, cx - 1, topY - 1, 3, 3, PAL.brassSh);
      // chocolate drip spout on the front
      px(ctx, cx - 2, cy + 4, 4, 8, PAL.copper); px(ctx, cx - 1, cy + 10 + ((tick >> 3) % 8), 2, 3, PAL.chocLite);
      break;
    }
    // ── analysis desks / terminals ──
    case "consoleChoc":
    case "consoleInvent": {
      isoBox(ctx, gx, gy, fw, fh, 20, PAL.wainscotHi, PAL.wainscotDk, PAL.wainscot, ox, oy, PAL.ink);
      px(ctx, cx - 16, cy - 4, 32, 2, PAL.brass);
      // monitor
      const sy = cy - 40;
      px(ctx, cx - 11, sy, 22, 15, PAL.dark); px(ctx, cx - 10, sy + 1, 20, 13, PAL.screenBg);
      const col = type === "consoleChoc" ? PAL.screenTeal : PAL.screenPink;
      for (let k = 0; k < 8; k++) { const h = 1 + ((tick / 6 + k) | 0) % 5; px(ctx, cx - 8 + k * 2, sy + 13 - h, 1, h, col); }
      px(ctx, cx - 11, sy + 15, 22, 2, PAL.metalSh);        // stand
      // papers + lamp + candy sample
      px(ctx, cx + 6, cy - 8, 8, 5, PAL.creamTile); px(ctx, cx + 7, cy - 7, 6, 1, PAL.creamSeam);
      px(ctx, cx - 15, cy - 12, 2, 8, PAL.brass); px(ctx, cx - 17, cy - 14, 6, 3, PAL.goldHi);
      break;
    }
    case "terminal": {
      isoBox(ctx, gx, gy, fw, fh, 18, PAL.metalHi, PAL.metalSh, PAL.metal, ox, oy, PAL.dark);
      const sy = cy - 36;
      px(ctx, cx - 10, sy, 20, 14, PAL.dark); px(ctx, cx - 9, sy + 1, 18, 12, PAL.screenBg);
      for (let r = 0; r < 3; r++) px(ctx, cx - 7, sy + 3 + r * 3, 4 + ((tick / 8 + r) | 0) % 10, 1, PAL.screenGreen);
      px(ctx, cx - 8, cy - 8, 16, 4, PAL.metalSh);          // keyboard
      for (let i = 0; i < 6; i++) px(ctx, cx - 7 + i * 2.6, cy - 7, 2, 2, PAL.dark);
      break;
    }
    // ── lab benches ──
    case "bench":
    case "benchFudge": {
      isoBox(ctx, gx, gy, fw, fh, 14, PAL.wainscotHi, PAL.wainscotDk, PAL.wainscot, ox, oy, PAL.ink);
      // brass legs hint + drawer lines
      px(ctx, cx - 22, cy - 2, 44, 1, PAL.brassSh);
      px(ctx, cx - 6, cy - 6, 1, 6, PAL.wainscotDk); px(ctx, cx + 6, cy - 6, 1, 6, PAL.wainscotDk);
      // candy jars + trays + a chocolate bar on top
      px(ctx, cx - 20, cy - 20, 7, 8, PAL.glass); px(ctx, cx - 19, cy - 17, 5, 5, PAL.cPink); px(ctx, cx - 20, cy - 20, 2, 8, PAL.glassHi);
      px(ctx, cx - 6, cy - 19, 7, 7, PAL.glass); px(ctx, cx - 5, cy - 16, 5, 4, PAL.cMint);
      px(ctx, cx + 8, cy - 16, 12, 5, PAL.choc); px(ctx, cx + 8, cy - 16, 12, 1, PAL.chocShine); px(ctx, cx + 8, cy - 16, 3, 5, PAL.gold);
      break;
    }
    case "moldTable": {
      isoBox(ctx, gx, gy, fw, fh, 14, PAL.wainscotHi, PAL.wainscotDk, PAL.wainscot, ox, oy, PAL.ink);
      // brass chocolate-mould tray with little chocolate squares
      px(ctx, cx - 14, cy - 16, 28, 8, PAL.brass); px(ctx, cx - 14, cy - 16, 28, 1, PAL.brassHi);
      for (let i = 0; i < 6; i++) px(ctx, cx - 12 + i * 4, cy - 14, 3, 4, i % 2 ? PAL.choc : PAL.chocHi);
      break;
    }
    case "barrel": {
      isoBox(ctx, gx, gy, fw, fh, 22, PAL.chocLite, PAL.chocDark, PAL.chocHi, ox, oy, PAL.ink);
      for (const yy of [cy - 12, cy - 2, cy + 8]) { px(ctx, cx - 14, yy, 28, 2, PAL.brass); px(ctx, cx - 14, yy, 28, 1, PAL.brassHi); }
      // open top with cocoa
      const topY = cy - 22;
      fillPoly(ctx, [{ x: cx, y: topY - 8 }, { x: cx + 16, y: topY }, { x: cx, y: topY + 8 }, { x: cx - 16, y: topY }], PAL.chocDark);
      fillPoly(ctx, [{ x: cx, y: topY - 5 }, { x: cx + 10, y: topY }, { x: cx, y: topY + 5 }, { x: cx - 10, y: topY }], PAL.choc);
      break;
    }
    case "shelf": {
      isoBox(ctx, gx, gy, fw, fh, 30, PAL.wainscotHi, PAL.wainscotDk, PAL.wainscot, ox, oy, PAL.ink);
      // stacked colorful candy boxes
      const boxes = [PAL.cViolet, PAL.cOrange, PAL.teal, PAL.cPink, PAL.cYellow, PAL.green];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) { const bx = cx - 12 + i * 12, by = cy - 8 - r * 9; px(ctx, bx, by, 11, 8, boxes[(r * 2 + i) % boxes.length]); px(ctx, bx, by, 11, 1, "#ffffff33"); px(ctx, bx, by + 3, 11, 1, "#00000022"); }
      break;
    }
    case "crate": {
      isoBox(ctx, gx, gy, fw, fh, 18, PAL.chocLite, PAL.chocDark, PAL.chocHi, ox, oy, PAL.ink);
      px(ctx, cx - 12, cy - 10, 24, 2, PAL.brass); px(ctx, cx - 12, cy, 24, 2, PAL.brassSh);
      px(ctx, cx - 8, cy - 18, 7, 5, PAL.choc); px(ctx, cx - 8, cy - 18, 2, 5, PAL.gold);   // foil bars poking out
      px(ctx, cx + 1, cy - 20, 7, 5, PAL.choc); px(ctx, cx + 1, cy - 20, 2, 5, PAL.gold);
      break;
    }
  }
}

// A small engraved brass plaque with pixel text (drawn by the engine above a piece).
export function drawSign(ctx: Ctx, cx: number, cy: number, text: string) {
  const w = textWidth(text) + 10;
  px(ctx, cx - w / 2 - 2, cy - 2, w + 4, 14, PAL.wainscotDk);   // wood backing
  px(ctx, cx - w / 2 - 1, cy - 1, w + 2, 12, PAL.brassSh);
  px(ctx, cx - w / 2, cy, w, 10, PAL.brass);
  px(ctx, cx - w / 2, cy, w, 1, PAL.brassHi);
  px(ctx, cx - w / 2, cy + 9, w, 1, PAL.brassDk);
  drawText(ctx, text, cx - w / 2 + 5, cy + 3, PAL.dark);
  // tiny hanger chains
  px(ctx, cx - w / 2 + 2, cy - 4, 1, 3, PAL.brassSh); px(ctx, cx + w / 2 - 3, cy - 4, 1, 3, PAL.brassSh);
}

// ── tiny 3×5 pixel font (uppercase + digits + space) ──
const GLYPHS: Record<string, number[]> = {
  A: [0b111, 0b101, 0b111, 0b101, 0b101], B: [0b110, 0b101, 0b110, 0b101, 0b110], C: [0b111, 0b100, 0b100, 0b100, 0b111],
  D: [0b110, 0b101, 0b101, 0b101, 0b110], E: [0b111, 0b100, 0b110, 0b100, 0b111], F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b111, 0b100, 0b101, 0b101, 0b111], H: [0b101, 0b101, 0b111, 0b101, 0b101], I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b111], K: [0b101, 0b110, 0b100, 0b110, 0b101], L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101], N: [0b101, 0b111, 0b111, 0b111, 0b101], O: [0b111, 0b101, 0b101, 0b101, 0b111],
  P: [0b111, 0b101, 0b111, 0b100, 0b100], Q: [0b111, 0b101, 0b101, 0b111, 0b011], R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b111, 0b100, 0b111, 0b001, 0b111], T: [0b111, 0b010, 0b010, 0b010, 0b010], U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010], W: [0b101, 0b101, 0b111, 0b111, 0b101], X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010], Z: [0b111, 0b001, 0b010, 0b100, 0b111], " ": [0, 0, 0, 0, 0],
};

export function drawText(ctx: Ctx, text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) if (g[row] & (1 << (2 - col))) ctx.fillRect(cx + col, y + row, 1, 1);
    cx += 4;
  }
}

export function textWidth(text: string) { return text.length * 4 - 1; }
