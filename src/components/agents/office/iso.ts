// Isometric coordinate system for the pixel-art factory world. Everything —
// floor, walls, furniture, agents, ambient props — derives its screen position
// from grid (gx, gy, gz) through THIS one projection. Strict 2:1 ratio.
// Native pixels; the whole canvas is scaled (nearest-neighbor) by the camera so
// pixels stay crisp. Tiles are 64×32 (2× the old res) for far more sprite detail.

export const TILE_W = 64;
export const TILE_H = 32;
export const ELEV = 24;   // native pixels a full z-level raises a sprite

export function gridToScreen(gx: number, gy: number, gz = 0, originX = 0, originY = 0) {
  return {
    x: originX + (gx - gy) * (TILE_W / 2),
    y: originY + (gx + gy) * (TILE_H / 2) - gz * ELEV,
  };
}

export function screenToGrid(sx: number, sy: number, originX = 0, originY = 0) {
  const a = (sx - originX) / (TILE_W / 2);
  const b = (sy - originY) / (TILE_H / 2);
  return { gx: Math.floor((a + b) / 2), gy: Math.floor((b - a) / 2) };
}

// Depth key: entities are painted back-to-front by their ground-contact tile.
export function depthOf(gx: number, gy: number, gz = 0) {
  return (gx + gy) * 1000 + gz;
}
