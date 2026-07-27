// The magical chocolate-factory floorplan. Logical tiles only — art lives in
// pixelSprites.ts, behavior in engine.ts. Furniture has real footprints that
// drive collision, pathfinding and depth. Zones map to the live agents'
// departments; each agent has a workstation it walks to and works at.

export type Dir = "NE" | "SE" | "SW" | "NW";

export const ROOM = { cols: 16, rows: 10 };

export type FurnitureType =
  | "vat" | "consoleChoc" | "bench" | "invention" | "consoleInvent"
  | "control" | "fudge" | "benchFudge" | "conveyor" | "crate"
  | "terminal" | "shelf" | "barrel" | "moldTable";

export interface Furniture {
  id: string;
  type: FurnitureType;
  gx: number; gy: number;
  fw: number; fh: number;
  sign?: string;
}

export const FURNITURE: Furniture[] = [
  // ── Chocolate Room (back-left) ──
  { id: "vat", type: "vat", gx: 1, gy: 1, fw: 2, fh: 2, sign: "CHOCOLATE" },
  { id: "consoleChoc", type: "consoleChoc", gx: 4, gy: 1, fw: 1, fh: 1 },
  { id: "bench", type: "bench", gx: 1, gy: 4, fw: 2, fh: 1 },
  { id: "barrel", type: "barrel", gx: 4, gy: 4, fw: 1, fh: 1 },
  { id: "moldTable", type: "moldTable", gx: 5, gy: 2, fw: 1, fh: 1 },
  // ── Inventing Room (back-right) ──
  { id: "invention", type: "invention", gx: 11, gy: 1, fw: 2, fh: 2, sign: "INVENTING" },
  { id: "consoleInvent", type: "consoleInvent", gx: 9, gy: 1, fw: 1, fh: 1 },
  { id: "shelf", type: "shelf", gx: 14, gy: 1, fw: 1, fh: 1 },
  // ── Control Room (right) ──
  { id: "control", type: "control", gx: 13, gy: 4, fw: 1, fh: 2, sign: "CONTROL" },
  { id: "terminal", type: "terminal", gx: 14, gy: 7, fw: 1, fh: 1 },
  // ── Fudge Room (front-left) ──
  { id: "fudge", type: "fudge", gx: 2, gy: 7, fw: 2, fh: 2, sign: "FUDGE" },
  { id: "benchFudge", type: "benchFudge", gx: 5, gy: 8, fw: 2, fh: 1 },
  // ── Center: conveyor line + crates ──
  { id: "conveyor", type: "conveyor", gx: 7, gy: 5, fw: 3, fh: 1 },
  { id: "crate", type: "crate", gx: 11, gy: 7, fw: 1, fh: 1 },
  { id: "crate2", type: "crate", gx: 6, gy: 3, fw: 1, fh: 1 },
];

export const AGENT_STATIONS: Record<string, { gx: number; gy: number; dir: Dir }> = {
  esther: { gx: 4, gy: 2, dir: "NE" },      // chocolate analysis console
  nehemiah: { gx: 2, gy: 5, dir: "NE" },    // chocolate bench
  elijah: { gx: 11, gy: 3, dir: "NE" },     // inventing machine
  samuel: { gx: 2, gy: 9, dir: "NE" },      // fudge mixer
  zacchaeus: { gx: 12, gy: 5, dir: "SE" },  // control console
};

export const ROOM_LABEL: Record<string, string> = {
  esther: "Chocolate Room", nehemiah: "Chocolate Room",
  elijah: "Inventing Room", samuel: "Fudge Room", zacchaeus: "Control Room",
};

export function homeFor(key: string): { room: string } {
  return { room: ROOM_LABEL[key] ?? "The Factory Floor" };
}

export function buildBlocked(): boolean[][] {
  const g: boolean[][] = Array.from({ length: ROOM.cols }, () => Array<boolean>(ROOM.rows).fill(false));
  for (const f of FURNITURE) for (let x = f.gx; x < f.gx + f.fw; x++) for (let y = f.gy; y < f.gy + f.fh; y++) if (x >= 0 && x < ROOM.cols && y >= 0 && y < ROOM.rows) g[x][y] = true;
  return g;
}

export function inBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gx < ROOM.cols && gy >= 0 && gy < ROOM.rows;
}

// Floor variety: 0/1 warm chocolate/caramel checker, 2 cream inset, 3 metal plate.
const CREAM = new Set(["4,3", "10,6", "6,8", "9,4", "12,8", "8,2", "2,3", "14,9"]);
const PLATE = new Set(["5,5", "10,4", "7,8", "13,8", "6,6", "3,6"]);
export function floorVariant(gx: number, gy: number): 0 | 1 | 2 | 3 {
  const k = `${gx},${gy}`;
  if (PLATE.has(k)) return 3;
  if (CREAM.has(k)) return 2;
  // scattered cream accents in a diagonal rhythm → reads as a real tiled floor
  if ((gx * 3 + gy * 5) % 11 === 0) return 2;
  return ((gx + gy) % 2) as 0 | 1;
}
