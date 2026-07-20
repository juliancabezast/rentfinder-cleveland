import * as THREE from "three";

// Procedural planet + galaxy textures generated on a canvas at mount time —
// no external assets, no CDN. Gas-giant bands, rocky moons, cloud shells and
// a Milky Way backdrop band.

function noiseRow(width: number, seed: number): number[] {
  // Smooth 1-D value noise (few octaves) for band wobble
  const out: number[] = [];
  const rand = (i: number, o: number) => {
    const x = Math.sin(i * 127.1 + o * 311.7 + seed * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let x = 0; x < width; x++) {
    let v = 0;
    let amp = 1;
    let freq = 1 / 64;
    for (let o = 0; o < 3; o++) {
      const i = x * freq;
      const i0 = Math.floor(i);
      const f = i - i0;
      const a = rand(i0, o);
      const b = rand(i0 + 1, o);
      v += (a + (b - a) * (f * f * (3 - 2 * f))) * amp;
      amp *= 0.5;
      freq *= 2;
    }
    out.push(v / 1.75);
  }
  return out;
}

function lerpColor(c1: THREE.Color, c2: THREE.Color, t: number): string {
  const c = c1.clone().lerp(c2, Math.min(1, Math.max(0, t)));
  return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
}

// ── Gas giant: horizontal bands + wobble, tinted from the stage color ──

export function makeGasGiantTexture(baseHex: string, seed = 1): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const base = new THREE.Color(baseHex);
  const light = base.clone().lerp(new THREE.Color("#ffffff"), 0.35);
  const dark = base.clone().lerp(new THREE.Color("#05060f"), 0.45);
  const warm = base.clone().lerp(new THREE.Color("#ffd9a0"), 0.25);

  const wobble = noiseRow(H, seed);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    // Layered sinusoid bands with per-latitude noise offset
    const band =
      0.5 +
      0.32 * Math.sin(t * Math.PI * 9 + seed) +
      0.22 * Math.sin(t * Math.PI * 23 + seed * 2.7) +
      0.35 * (wobble[y] - 0.5);
    const palette = band > 0.62 ? light : band < 0.38 ? dark : base.clone().lerp(warm, band);
    ctx.fillStyle = lerpColor(dark, palette instanceof THREE.Color ? palette : base, 0.35 + band * 0.65);
    ctx.fillRect(0, y, W, 1);
  }

  // Horizontal streaking so bands feel wind-sheared
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * H;
    const len = 30 + Math.random() * 140;
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(Math.random() * W, y, len, 1);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ── Rocky moon: speckled fBm-ish noise + craters (for LOST) ──────────

export function makeRockyTexture(baseHex: string, seed = 7): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const base = new THREE.Color(baseHex);
  const dark = base.clone().lerp(new THREE.Color("#000000"), 0.5);
  ctx.fillStyle = lerpColor(base, dark, 0.25);
  ctx.fillRect(0, 0, W, H);

  // Mottled patches
  for (let i = 0; i < 900; i++) {
    const r = 1 + Math.random() * 6;
    ctx.globalAlpha = 0.05 + Math.random() * 0.1;
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Craters: dark disc + light rim
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 4 + Math.random() * 14;
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  void seed;
  return tex;
}

// ── Cloud shell: transparent white wisps ─────────────────────────────

export function makeCloudTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i < 240; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const rx = 14 + Math.random() * 46;
    const ry = 3 + Math.random() * 8; // stretched = wind-blown
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.09})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ── Milky Way backdrop: galactic band + dust lanes + core glow ───────

export function makeGalaxyTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // LIGHT cosmos — matches the app's cool-gray canvas instead of deep space
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#f2f4fc");
  bg.addColorStop(0.5, "#e9edfa");
  bg.addColorStop(1, "#eef0f9");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const bandY = H * 0.52;

  // Lavender glow of the galactic plane
  let g = ctx.createLinearGradient(0, bandY - H * 0.3, 0, bandY + H * 0.3);
  g.addColorStop(0, "rgba(99,102,241,0)");
  g.addColorStop(0.5, "rgba(99,102,241,0.10)");
  g.addColorStop(1, "rgba(99,102,241,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, bandY - H * 0.3, W, H * 0.6);

  // Brighter core band
  g = ctx.createLinearGradient(0, bandY - H * 0.1, 0, bandY + H * 0.1);
  g.addColorStop(0, "rgba(139,92,246,0)");
  g.addColorStop(0.5, "rgba(139,92,246,0.12)");
  g.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, bandY - H * 0.1, W, H * 0.2);

  // Warm golden bulge
  const bulge = ctx.createRadialGradient(W * 0.62, bandY, 0, W * 0.62, bandY, W * 0.2);
  bulge.addColorStop(0, "rgba(255,178,44,0.14)");
  bulge.addColorStop(0.5, "rgba(255,178,44,0.05)");
  bulge.addColorStop(1, "rgba(255,178,44,0)");
  ctx.fillStyle = bulge;
  ctx.fillRect(0, 0, W, H);

  // Soft slate "dust" wisps along the band
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * W;
    const y = bandY + (Math.random() - 0.5) * H * 0.09;
    const rx = 30 + Math.random() * 120;
    const dg = ctx.createRadialGradient(x, y, 0, x, y, rx);
    dg.addColorStop(0, "rgba(148,163,184,0.16)");
    dg.addColorStop(1, "rgba(148,163,184,0)");
    ctx.fillStyle = dg;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Star specks: indigo/slate dots that read on light, dense along the band
  for (let i = 0; i < 2400; i++) {
    const nearBand = Math.random() < 0.72;
    const y = nearBand
      ? bandY + (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.12
      : Math.random() * H;
    const x = Math.random() * W;
    const r = Math.random() < 0.94 ? 0.7 : 1.4;
    const warm = Math.random() < 0.18;
    ctx.globalAlpha = 0.15 + Math.random() * 0.3;
    ctx.fillStyle = warm ? "#d99a2b" : "#6470c9";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
