// Tile-based A* on the factory grid. 4-directional (no diagonal squeezing past
// furniture corners → cleaner isometric movement). `blocked(gx,gy)` returns true
// for walls / furniture footprints / out-of-bounds; `occupied` optionally treats
// tiles held by other agents as temporarily blocked (except the goal).

export interface Pt { gx: number; gy: number; }

const key = (x: number, y: number) => `${x},${y}`;

export function findPath(
  start: Pt,
  goal: Pt,
  blocked: (gx: number, gy: number) => boolean,
  occupied?: (gx: number, gy: number) => boolean,
): Pt[] | null {
  if (start.gx === goal.gx && start.gy === goal.gy) return [];
  if (blocked(goal.gx, goal.gy)) return null;

  const h = (x: number, y: number) => Math.abs(x - goal.gx) + Math.abs(y - goal.gy);
  const open = new Map<string, { x: number; y: number; g: number; f: number; p: string | null }>();
  const closed = new Set<string>();
  const startK = key(start.gx, start.gy);
  open.set(startK, { x: start.gx, y: start.gy, g: 0, f: h(start.gx, start.gy), p: null });
  const all = new Map(open);

  let guard = 0;
  while (open.size && guard++ < 4000) {
    // pop lowest f
    let bestK = "";
    let best = Infinity;
    for (const [k, n] of open) if (n.f < best) { best = n.f; bestK = k; }
    const cur = open.get(bestK)!;
    open.delete(bestK);
    closed.add(bestK);

    if (cur.x === goal.gx && cur.y === goal.gy) {
      const path: Pt[] = [];
      let k: string | null = bestK;
      while (k) { const n = all.get(k)!; path.push({ gx: n.x, gy: n.y }); k = n.p; }
      path.reverse();
      path.shift(); // drop the start tile
      return path;
    }

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (blocked(nx, ny)) continue;
      const isGoal = nx === goal.gx && ny === goal.gy;
      if (!isGoal && occupied?.(nx, ny)) continue;
      const g = cur.g + 1;
      const ex = open.get(nk);
      if (!ex || g < ex.g) {
        const node = { x: nx, y: ny, g, f: g + h(nx, ny), p: bestK };
        open.set(nk, node);
        all.set(nk, node);
      }
    }
  }
  return null;
}
