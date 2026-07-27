// The world engine: one rAF loop that runs behavior + movement, then paints the
// factory back-to-front (floor+walls cached, furniture+agents depth-sorted so
// agents pass behind/in front of machines). App state (agent data/status/
// selection) is pushed in via setAgents/setSelectedKey; the loop never touches
// React. Pixel-crisp: native-res buffer, integer CSS scale by the wrapper.

import { TILE_H, TILE_W, depthOf, gridToScreen } from "./iso";
import {
  AGENT_STATIONS, FURNITURE, ROOM, buildBlocked, floorVariant, inBounds, type Dir, type Furniture,
} from "./room";
import { WALL_H, drawAmbient, drawFloorTile, drawFurniture, drawSign, drawText, drawWalls, fillPoly, textWidth } from "./pixelSprites";
import { buildAtlas, type AgentAtlas, type Pose } from "./agentSprites";
import { findPath, type Pt } from "./pathfinding";

// Camera framing is COMPUTED from the room geometry so the world is tightly
// bounded (no baked-in dark border): floor-diamond bbox + short walls + a small
// margin. The wrapper scales this native buffer to fill the viewport.
const MARGIN = 10;
const _hw = TILE_W / 2, _hh = TILE_H / 2;
const _xMin = -(ROOM.rows - 1) * _hw - _hw;                 // left corner tip
const _xMax = (ROOM.cols - 1) * _hw + _hw;                  // right corner tip
const _yTop = -_hh - WALL_H;                                // wall top above back corner
const _yBot = (ROOM.cols - 1 + ROOM.rows - 1) * _hh + _hh;  // front corner tip
export const NATIVE_W = Math.round(_xMax - _xMin + MARGIN * 2);
export const NATIVE_H = Math.round(_yBot - _yTop + MARGIN * 2);
const ORIGIN_X = Math.round(-_xMin + MARGIN);
const ORIGIN_Y = Math.round(-_yTop + MARGIN);
const SPEED = 2.2;             // tiles / second
const WALK_FPS = 10, WORK_FPS = 3;

export interface AgentInput { key: string; name: string; role: string; health: "active" | "idle" | "error" | "disabled"; }

const HEALTH_DOT: Record<string, string> = { active: "#5fd08a", idle: "#9aa4af", error: "#e0574f", disabled: "#6b7280", waiting: "#e8c15a" };

interface Agent {
  key: string; name: string; health: AgentInput["health"];
  atlas: AgentAtlas;
  gx: number; gy: number;                 // float tile position (feet)
  dir: Dir; pose: Pose; frame: number; frameT: number;
  path: Pt[]; pi: number;
  state: "idle" | "toStation" | "working" | "wander";
  nextDecision: number;
  station?: { gx: number; gy: number; dir: Dir };
}

export class OfficeWorld {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private blocked: boolean[][];
  private furniture: Furniture[] = FURNITURE;
  private agents: Agent[] = [];
  private raf = 0;
  private last = 0;
  private tick = 0;
  private selectedKey: string | null = null;
  private hoverKey: string | null = null;
  private reduced: boolean;
  private onPickCb?: (key: string | null) => void;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }) {
    canvas.width = NATIVE_W; canvas.height = NATIVE_H;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.reduced = opts.reducedMotion;
    this.blocked = buildBlocked();
    this.bg = this.buildBackground();
  }

  private buildBackground(): HTMLCanvasElement {
    const cv = document.createElement("canvas"); cv.width = NATIVE_W; cv.height = NATIVE_H;
    const c = cv.getContext("2d")!; c.imageSmoothingEnabled = false;
    // ambient room fill (warm dark chocolate, NOT purple)
    c.fillStyle = "#2a1a12"; c.fillRect(0, 0, NATIVE_W, NATIVE_H);
    drawWalls(c, ROOM.cols, ROOM.rows, ORIGIN_X, ORIGIN_Y);
    for (let gy = 0; gy < ROOM.rows; gy++) for (let gx = 0; gx < ROOM.cols; gx++) drawFloorTile(c, gx, gy, floorVariant(gx, gy), ORIGIN_X, ORIGIN_Y);
    return cv;
  }

  setAgents(list: AgentInput[]) {
    const seen = new Set<string>();
    for (const a of list) {
      seen.add(a.key);
      let ent = this.agents.find((e) => e.key === a.key);
      const st = AGENT_STATIONS[a.key];
      if (!ent) {
        const start = st ?? { gx: 6, gy: 5, dir: "SE" as Dir };
        ent = {
          key: a.key, name: a.name, health: a.health, atlas: buildAtlas(a.key),
          gx: start.gx, gy: start.gy, dir: start.dir, pose: "work", frame: 0, frameT: 0,
          path: [], pi: 0, state: "working", nextDecision: 1500 + Math.random() * 4000, station: st,
        };
        this.agents.push(ent);
      } else {
        ent.name = a.name; ent.health = a.health;
      }
    }
    this.agents = this.agents.filter((e) => seen.has(e.key));
    if (this.reduced) this.render();
  }

  setSelectedKey(k: string | null) { this.selectedKey = k; if (this.reduced) this.render(); }
  onPick(cb: (key: string | null) => void) { this.onPickCb = cb; }

  pickAt(nx: number, ny: number): string | null {
    // topmost agent whose sprite bounds contain the point
    let best: string | null = null, bestDepth = -Infinity;
    for (const a of this.agents) {
      const s = gridToScreen(a.gx, a.gy, 0, ORIGIN_X, ORIGIN_Y);
      const x0 = s.x - a.atlas.feetX, y0 = s.y - a.atlas.feetY;
      if (nx >= x0 + 4 && nx <= x0 + a.atlas.W - 4 && ny >= y0 && ny <= y0 + a.atlas.H) {
        const d = depthOf(a.gx, a.gy);
        if (d > bestDepth) { bestDepth = d; best = a.key; }
      }
    }
    return best;
  }
  setHover(nx: number, ny: number): string | null { this.hoverKey = this.pickAt(nx, ny); if (this.reduced) this.render(); return this.hoverKey; }

  start() {
    if (this.reduced) { this.render(); return; }
    this.last = performance.now();
    const loop = (t: number) => { const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.tick++; this.update(dt, t); this.render(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  destroy() { this.stop(); }

  // ── occupancy: other agents' current + next tile block a path ──
  private occupied(exclude: Agent) {
    const set = new Set<string>();
    for (const a of this.agents) {
      if (a === exclude) continue;
      set.add(`${Math.round(a.gx)},${Math.round(a.gy)}`);
      const nt = a.path[a.pi]; if (nt) set.add(`${nt.gx},${nt.gy}`);
    }
    return (x: number, y: number) => set.has(`${x},${y}`);
  }
  private isBlocked = (x: number, y: number) => !inBounds(x, y) || this.blocked[x][y];

  private goTo(a: Agent, goal: Pt): boolean {
    const start = { gx: Math.round(a.gx), gy: Math.round(a.gy) };
    const path = findPath(start, goal, this.isBlocked, this.occupied(a));
    if (!path) return false;
    a.path = path; a.pi = 0;
    return true;
  }

  private randomWalkable(near: Agent): Pt | null {
    for (let t = 0; t < 12; t++) {
      const gx = Math.round(a_clamp(near.gx + (Math.random() * 8 - 4), 0, ROOM.cols - 1));
      const gy = Math.round(a_clamp(near.gy + (Math.random() * 8 - 4), 0, ROOM.rows - 1));
      if (!this.isBlocked(gx, gy)) return { gx, gy };
    }
    return null;
  }

  private onArrive(a: Agent, now: number) {
    const atStation = !!a.station && Math.round(a.gx) === a.station.gx && Math.round(a.gy) === a.station.gy;
    if (a.state === "toStation" && atStation) {
      a.pose = "work"; a.state = "working"; a.dir = a.station!.dir; a.frame = 0;
      a.nextDecision = now + 4000 + Math.random() * 8000;
    } else {
      a.pose = "idle"; a.state = "idle"; a.frame = 0;
      a.nextDecision = now + 2500 + Math.random() * 5000;
    }
  }

  private decide(a: Agent, now: number) {
    if (a.health === "disabled") { a.state = "idle"; a.pose = "idle"; if (a.station) a.dir = a.station.dir; a.nextDecision = now + 6000; return; }
    const atStation = a.station && Math.round(a.gx) === a.station.gx && Math.round(a.gy) === a.station.gy;
    const r = Math.random();
    const workBias = a.health === "active" ? 0.62 : a.health === "error" ? 0.5 : 0.32;

    if (a.station && !atStation && r < workBias) {
      if (this.goTo(a, a.station)) { a.state = "toStation"; return; }
    }
    if (r < workBias + 0.28) {
      const p = this.randomWalkable(a);
      if (p && this.goTo(a, p)) { a.state = "wander"; return; }
    }
    // look around in place
    const dirs: Dir[] = ["SE", "SW", "NE", "NW"];
    a.dir = dirs[(Math.random() * 4) | 0];
    a.pose = atStation ? "work" : "idle";
    a.state = atStation ? "working" : "idle";
    a.nextDecision = now + (a.state === "working" ? 4000 + Math.random() * 7000 : 2500 + Math.random() * 4500);
  }

  private update(dt: number, now: number) {
    for (const a of this.agents) {
      if (a.path.length && a.pi < a.path.length) {
        const tile = a.path[a.pi];
        const dx = tile.gx - a.gx, dy = tile.gy - a.gy;
        const dist = Math.hypot(dx, dy);
        a.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "SE" : "NW") : (dy > 0 ? "SW" : "NE");
        a.pose = "walk";
        const step = SPEED * dt;
        if (dist <= step) { a.gx = tile.gx; a.gy = tile.gy; a.pi++; if (a.pi >= a.path.length) { a.path = []; this.onArrive(a, now); } }
        else { a.gx += (dx / dist) * step; a.gy += (dy / dist) * step; }
        // animate walk
        a.frameT += dt; if (a.frameT > 1 / WALK_FPS) { a.frameT = 0; a.frame = (a.frame + 1) % 4; }
      } else {
        // arrived / idle behavior
        if (a.pose === "work") { a.frameT += dt; if (a.frameT > 1 / WORK_FPS) { a.frameT = 0; a.frame = (a.frame + 1) % 2; } }
        else a.frame = 0;
        if (now >= a.nextDecision) this.decide(a, now);
      }
    }
  }

  private render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, NATIVE_W, NATIVE_H);
    ctx.drawImage(this.bg, 0, 0);
    drawAmbient(ctx, this.tick, ROOM.cols, ROOM.rows, ORIGIN_X, ORIGIN_Y);

    type D = { depth: number; draw: () => void };
    const list: D[] = [];

    for (const f of this.furniture) {
      const depth = depthOf(f.gx + f.fw - 1, f.gy + f.fh - 1, 1);
      list.push({
        depth, draw: () => {
          drawFurniture(ctx, f.type, f.gx, f.gy, f.fw, f.fh, ORIGIN_X, ORIGIN_Y, this.tick);
          if (f.sign) {
            const c = gridToScreen(f.gx + (f.fw - 1) / 2, f.gy + (f.fh - 1) / 2, 0, ORIGIN_X, ORIGIN_Y);
            drawSign(ctx, c.x, c.y - 82, f.sign);
          }
        },
      });
    }

    for (const a of this.agents) {
      const s = gridToScreen(a.gx, a.gy, 0, ORIGIN_X, ORIGIN_Y);
      const depth = depthOf(a.gx, a.gy, 2);
      list.push({
        depth, draw: () => {
          // selection tile highlight
          if (this.selectedKey === a.key) {
            fillPoly(ctx, [{ x: s.x, y: s.y - TILE_H / 2 }, { x: s.x + TILE_W / 2, y: s.y }, { x: s.x, y: s.y + TILE_H / 2 }, { x: s.x - TILE_W / 2, y: s.y }], "#ffcf5c55");
          }
          // contact shadow (dithered iso ellipse)
          fillPoly(ctx, [{ x: s.x, y: s.y - 5 }, { x: s.x + 13, y: s.y }, { x: s.x, y: s.y + 5 }, { x: s.x - 13, y: s.y }], "#0000002e");
          // sprite
          const spr = a.atlas.get(a.dir, a.pose, a.frame);
          ctx.drawImage(spr, Math.round(s.x - a.atlas.feetX), Math.round(s.y - a.atlas.feetY));
          // label on hover / select — small floating plaque with status dot
          const top = s.y - a.atlas.feetY;
          if (this.hoverKey === a.key || this.selectedKey === a.key) {
            const w = textWidth(a.name) + 12;
            const lx = Math.round(s.x - w / 2), ly = Math.round(top - 13);
            ctx.fillStyle = "#160d07e6"; ctx.fillRect(lx, ly, w, 11);
            ctx.fillStyle = this.selectedKey === a.key ? "#ffcf5c" : "#8a6c2c"; ctx.fillRect(lx, ly, w, 1); ctx.fillRect(lx, ly + 10, w, 1);
            ctx.fillStyle = HEALTH_DOT[a.health] || HEALTH_DOT.idle; ctx.fillRect(lx + 3, ly + 4, 3, 3);
            drawText(ctx, a.name, lx + 9, ly + 3, "#f4e3c0");
          } else {
            // tiny persistent status dot above head
            ctx.fillStyle = HEALTH_DOT[a.health] || HEALTH_DOT.idle;
            ctx.fillRect(Math.round(s.x - 1), Math.round(top - 4), 3, 3);
          }
        },
      });
    }

    list.sort((p, q) => p.depth - q.depth);
    for (const d of list) d.draw();
  }
}

function a_clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
