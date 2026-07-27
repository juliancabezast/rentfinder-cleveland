// Original modular pixel-art humans — readable social-world avatars (not tiny RPG
// sprites). Drawn at high logical resolution (36×54) so head, hair, face, jacket,
// sleeves, hands, legs and shoes are all legible. Two base views (front = face
// visible, back = nape) face RIGHT and are mirrored to cover the four iso
// directions. Poses: idle, walk (4 frames), work (2 frames). Appearance
// (skin/hair/style/jacket/pants/hat/glasses/accessory) is derived deterministically
// per agent key → each agent is distinct but stable. Pre-rendered once into an
// atlas of tiny canvases and blitted crisp (no scaling) by the engine.

import type { Dir } from "./room";

export type HairStyle = "short" | "flat" | "tall" | "bun" | "bald" | "long";
export interface Appearance {
  skin: string; hair: string; hairStyle: HairStyle;
  top: string; topTrim: string; pants: string; shoe: string;
  hat: "none" | "cap" | "beanie" | "goggles"; hatColor: string;
  accent: string; glasses: boolean;
}

const SKIN = ["#f2caa4", "#e6b184", "#c88a52", "#9c6a3c", "#7a4a28", "#f7d9bf"];
const HAIR = ["#2b2119", "#4a2f1c", "#caa14a", "#7a2f2f", "#dcdcdc", "#33305a", "#141414", "#a5561f"];
const HAIRSTYLE: HairStyle[] = ["short", "flat", "tall", "bun", "long", "short", "bald", "short"];
// jackets / aprons — rich, contrasting, NOT all brown
const TOP = ["#2f7d8a", "#7a2438", "#c08a2e", "#2f7d4e", "#3a4a86", "#5a3a86", "#b5713a", "#3a6ea5", "#c94f6d"];
const TRIM = ["#efe3c8", "#f2d9a0", "#d8e6e2", "#ecd0d8"];
const PANTS = ["#3a2f2a", "#2a3340", "#4a3a2a", "#26262c", "#3d3550"];
const SHOE = ["#2a1a12", "#161616", "#3a2a1a", "#4a3020"];
const HAT: Appearance["hat"][] = ["none", "none", "cap", "goggles", "beanie", "none"];
const ACCENT = ["#ffcf5c", "#e7629f", "#8fe6d0", "#f2913c", "#9b6fd0", "#5ce0cf"];

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function deriveAppearance(key: string): Appearance {
  const h = hash(key);
  const pick = <T>(arr: T[], shift: number) => arr[(h >>> shift) % arr.length];   // >>> unsigned — signed >> would give a negative index
  return {
    skin: pick(SKIN, 0), hair: pick(HAIR, 3), hairStyle: pick(HAIRSTYLE, 6),
    top: pick(TOP, 9), topTrim: pick(TRIM, 13), pants: pick(PANTS, 16), shoe: pick(SHOE, 19),
    hat: pick(HAT, 22), hatColor: pick(TOP, 25), accent: pick(ACCENT, 27), glasses: ((h >>> 30) & 1) === 1,
  };
}

const W = 36, H = 54, FEET_X = 18, FEET_Y = 53; // anchor = feet center

type Ctx = CanvasRenderingContext2D;
const p = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
const clamp = (v: number) => Math.max(0, Math.min(255, v));

// Draw one human facing RIGHT. view: front (face) or back (nape). leg 0..3 (walk phase), work overrides arms.
function drawHuman(c: Ctx, ap: Appearance, view: "front" | "back", leg: number, work: boolean) {
  const cx = FEET_X;
  const legFwd = leg === 1 ? 1 : leg === 3 ? -1 : 0;   // +1 right leg forward, -1 left leg forward
  const bob = leg === 1 || leg === 3 ? -1 : 0;         // body rises mid-stride
  const armFwd = -legFwd;
  const y = (v: number) => v + bob;                    // torso/head/arms bob; feet stay grounded

  const topSh = shade(ap.top, -26), topHi = shade(ap.top, 22);
  const skinSh = shade(ap.skin, -30);

  // ── legs + shoes ──
  // right leg (viewer-right / forward side)
  const rlx = cx + 1 + (legFwd > 0 ? 2 : legFwd < 0 ? -1 : 0);
  const rLift = legFwd < 0 ? 1 : 0;
  p(c, rlx, y(39), 4, 11 - rLift, ap.pants);
  p(c, rlx, y(39), 1, 11 - rLift, shade(ap.pants, 16));
  p(c, rlx - 1, y(50 - rLift), 5, 3, ap.shoe);
  p(c, rlx - 1, y(50 - rLift), 5, 1, shade(ap.shoe, 24));
  // left leg
  const llx = cx - 4 + (legFwd < 0 ? 2 : legFwd > 0 ? -1 : 0);
  const lLift = legFwd > 0 ? 1 : 0;
  p(c, llx, y(39), 4, 11 - lLift, shade(ap.pants, -10));
  p(c, llx - 1, y(50 - lLift), 5, 3, shade(ap.shoe, -12));

  // ── torso / jacket ──
  p(c, cx - 6, y(22), 13, 18, ap.top);                 // body
  p(c, cx - 6, y(22), 13, 2, topHi);                   // shoulders highlight
  p(c, cx + 4, y(24), 3, 16, topSh);                   // right-side shadow
  p(c, cx - 6, y(38), 13, 2, topSh);                   // hem shadow
  // collar / lapel / apron bib
  if (view === "front") {
    p(c, cx - 3, y(22), 7, 4, ap.topTrim);             // collar
    p(c, cx - 2, y(26), 5, 12, shade(ap.topTrim, -8)); // apron bib
    p(c, cx - 1, y(28), 1, 8, ap.accent);              // placket / buttons line
    p(c, cx - 1, y(29), 1, 1, shade(ap.accent, 30)); p(c, cx - 1, y(33), 1, 1, shade(ap.accent, 30));
  } else {
    p(c, cx - 3, y(22), 7, 3, shade(ap.top, -14));     // yoke seam on back
    p(c, cx, y(24), 1, 14, topSh);                     // spine seam
  }

  // ── arms + hands ──
  if (work) {
    // both arms forward toward a workstation, hands busy
    p(c, cx - 7, y(24), 3, 7, ap.top); p(c, cx - 7, y(30), 3, 3, ap.skin);
    p(c, cx + 6, y(24), 3, 7, ap.top); p(c, cx + 6, y(30), 3, 3, ap.skin);
    p(c, cx + 8, y(31), 2, 2, skinSh);
  } else {
    // left arm
    p(c, cx - 8 - (armFwd > 0 ? 1 : 0), y(23), 3, 11, ap.top);
    p(c, cx - 8 - (armFwd > 0 ? 1 : 0), y(33), 3, 3, ap.skin);
    // right arm
    p(c, cx + 6 + (armFwd < 0 ? 1 : 0), y(23), 3, 11, topSh);
    p(c, cx + 6 + (armFwd < 0 ? 1 : 0), y(33), 3, 3, skinSh);
  }

  // ── accessory: scarf/tie at the neck ──
  if (view === "front" && ap.glasses === false && ap.hat !== "goggles") {
    p(c, cx - 2, y(21), 5, 2, ap.accent);
  }

  // ── neck + head ──
  p(c, cx - 2, y(19), 5, 3, ap.skin);                  // neck
  p(c, cx - 2, y(21), 5, 1, skinSh);
  p(c, cx - 5, y(6), 11, 14, ap.skin);                 // head
  p(c, cx - 5, y(6), 11, 1, shade(ap.skin, 24));       // brow highlight
  p(c, cx - 5, y(18), 11, 2, skinSh);                  // jaw shadow
  p(c, cx - 6, y(11), 1, 3, ap.skin); p(c, cx + 6, y(11), 1, 3, ap.skin); // ears

  if (view === "front") {
    drawFace(c, cx, y, ap, skinSh);
    drawHair(c, cx, y, ap, "front");
  } else {
    drawHair(c, cx, y, ap, "back");
  }
  drawHat(c, cx, y, ap, view);
}

function drawFace(c: Ctx, cx: number, y: (v: number) => number, ap: Appearance, skinSh: string) {
  // eyes
  if (ap.glasses) {
    p(c, cx - 4, y(11), 4, 3, "#2a2a2a"); p(c, cx + 1, y(11), 4, 3, "#2a2a2a");
    p(c, cx - 3, y(12), 2, 1, ap.accent); p(c, cx + 2, y(12), 2, 1, ap.accent);
    p(c, cx - 1, y(12), 1, 1, "#2a2a2a"); // bridge
  } else {
    p(c, cx - 3, y(12), 2, 2, "#241812"); p(c, cx + 2, y(12), 2, 2, "#241812");
    p(c, cx - 3, y(12), 1, 1, shade(ap.skin, 20)); p(c, cx + 2, y(12), 1, 1, shade(ap.skin, 20));
  }
  // brows
  p(c, cx - 4, y(10), 3, 1, shade(ap.hair, -10)); p(c, cx + 2, y(10), 3, 1, shade(ap.hair, -10));
  // nose + mouth
  p(c, cx, y(14), 1, 2, skinSh);
  p(c, cx - 2, y(17), 4, 1, shade(ap.skin, -18));
}

function drawHair(c: Ctx, cx: number, y: (v: number) => number, ap: Appearance, view: "front" | "back") {
  const hi = shade(ap.hair, 22), sh = shade(ap.hair, -16);
  if (ap.hairStyle === "bald") {
    if (view === "back") { p(c, cx - 5, y(6), 11, 4, ap.skin); }        // just scalp
    p(c, cx - 5, y(6), 11, 1, shade(ap.skin, 22));
    return;
  }
  if (view === "back") {
    const bottom = ap.hairStyle === "long" ? 20 : ap.hairStyle === "bun" ? 15 : 14;
    p(c, cx - 5, y(5), 11, bottom - 5, ap.hair);
    p(c, cx - 5, y(5), 11, 1, hi);
    p(c, cx - 5, y(bottom - 1), 11, 1, sh);
    if (ap.hairStyle === "bun") p(c, cx - 2, y(3), 5, 4, ap.hair);
    return;
  }
  // front
  const topY = ap.hairStyle === "tall" ? 2 : ap.hairStyle === "flat" ? 5 : 4;
  p(c, cx - 5, y(topY), 11, 6 - (topY - 4), ap.hair);                    // crown
  p(c, cx - 5, y(topY), 11, 1, hi);
  p(c, cx - 6, y(9), 2, ap.hairStyle === "long" ? 8 : 4, ap.hair);       // left side
  p(c, cx + 5, y(9), 2, ap.hairStyle === "long" ? 8 : 4, ap.hair);       // right side
  if (ap.hairStyle === "tall") p(c, cx - 3, y(1), 6, 3, ap.hair);        // pompadour bump
  if (ap.hairStyle === "bun") p(c, cx + 3, y(4), 4, 4, ap.hair);         // side bun hint
  // fringe
  p(c, cx - 5, y(9), 4, 1, ap.hair); p(c, cx + 1, y(9), 3, 1, ap.hair);
}

function drawHat(c: Ctx, cx: number, y: (v: number) => number, ap: Appearance, view: "front" | "back") {
  if (ap.hat === "cap") {
    p(c, cx - 6, y(4), 13, 3, ap.hatColor); p(c, cx - 6, y(4), 13, 1, shade(ap.hatColor, 26));
    p(c, cx - 6, y(3), 11, 1, ap.hatColor);
    if (view === "front") p(c, cx + 5, y(6), 4, 1, shade(ap.hatColor, -18)); // brim
  } else if (ap.hat === "beanie") {
    p(c, cx - 6, y(3), 13, 5, ap.hatColor); p(c, cx - 6, y(7), 13, 2, shade(ap.hatColor, -20));
    p(c, cx - 6, y(3), 13, 1, shade(ap.hatColor, 24));
  } else if (ap.hat === "goggles") {
    p(c, cx - 6, y(6), 13, 3, "#2a2a2a");
    p(c, cx - 4, y(6), 4, 3, ap.accent); p(c, cx + 1, y(6), 4, 3, ap.accent);
    p(c, cx - 4, y(6), 4, 1, shade(ap.accent, 30)); p(c, cx + 1, y(6), 4, 1, shade(ap.accent, 30));
  }
}

function makeFrame(ap: Appearance, view: "front" | "back", leg: number, work: boolean): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!; c.imageSmoothingEnabled = false;
  drawHuman(c, ap, view, leg, work);
  return cv;
}

function flip(src: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!; c.imageSmoothingEnabled = false;
  c.translate(W, 0); c.scale(-1, 1); c.drawImage(src, 0, 0);
  return cv;
}

export type Pose = "idle" | "walk" | "work";
export interface AgentAtlas {
  W: number; H: number; feetX: number; feetY: number;
  get: (dir: Dir, pose: Pose, frameIdx: number) => HTMLCanvasElement;
}

const cache = new Map<string, AgentAtlas>();

export function buildAtlas(key: string): AgentAtlas {
  const hit = cache.get(key);
  if (hit) return hit;
  const ap = deriveAppearance(key);

  const frontWalk = [0, 1, 2, 3].map((l) => makeFrame(ap, "front", l, false));
  const backWalk = [0, 1, 2, 3].map((l) => makeFrame(ap, "back", l, false));
  const frontWork = [makeFrame(ap, "front", 0, true), makeFrame(ap, "front", 2, true)];
  const backWork = [makeFrame(ap, "back", 0, true), makeFrame(ap, "back", 2, true)];

  const frontWalkL = frontWalk.map(flip), backWalkL = backWalk.map(flip);
  const frontWorkL = frontWork.map(flip), backWorkL = backWork.map(flip);

  // SE=front-right, SW=front-left, NE=back-right, NW=back-left
  const table: Record<Dir, { walk: HTMLCanvasElement[]; work: HTMLCanvasElement[] }> = {
    SE: { walk: frontWalk, work: frontWork },
    SW: { walk: frontWalkL, work: frontWorkL },
    NE: { walk: backWalk, work: backWork },
    NW: { walk: backWalkL, work: backWorkL },
  };

  const atlas: AgentAtlas = {
    W, H, feetX: FEET_X, feetY: FEET_Y,
    get: (dir, pose, i) => {
      const t = table[dir];
      if (pose === "work") return t.work[i % t.work.length];
      if (pose === "idle") return t.walk[0];
      return t.walk[i % t.walk.length];
    },
  };
  cache.set(key, atlas);
  return atlas;
}
