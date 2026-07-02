// Applies the org's configured brand colors to the shadcn/Tailwind CSS variables
// so the whole app themes off organizations.primary_color / accent_color.
// Stored values are hex; the CSS variables are HSL triples ("H S% L%").
// Called on org load (AuthContext) and after saving the Branding card.

const DEFAULT_PRIMARY = "#4F46E5";
const DEFAULT_ACCENT = "#ffb22c";

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// WCAG relative luminance — picks a readable foreground (white vs near-black).
function luminance({ r, g, b }: Rgb): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Set the brand CSS variables from the org's primary/accent hex colors.
 * Falls back to the design-system defaults for missing/invalid values.
 * Call with no args to reset to defaults (e.g. on sign-out).
 */
export function applyBrandTheme(primaryHex?: string | null, accentHex?: string | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const pRgb = hexToRgb(primaryHex || "") || hexToRgb(DEFAULT_PRIMARY)!;
  const aRgb = hexToRgb(accentHex || "") || hexToRgb(DEFAULT_ACCENT)!;
  const p = rgbToHsl(pRgb);
  const a = rgbToHsl(aRgb);

  const primaryFg = luminance(pRgb) > 0.55 ? "240 6% 10%" : "0 0% 100%";
  const accentFg = luminance(aRgb) > 0.55 ? `${a.h} 45% 15%` : "0 0% 100%";

  const set = (k: string, v: string) => root.style.setProperty(k, v);
  const primaryHsl = `${p.h} ${p.s}% ${p.l}%`;

  set("--primary", primaryHsl);
  set("--primary-foreground", primaryFg);
  set("--ring", primaryHsl);
  set("--sidebar-primary", primaryHsl);
  set("--sidebar-primary-foreground", primaryFg);
  set("--sidebar-ring", primaryHsl);
  // Light tint + readable foreground for sidebar active items, derived from the primary hue.
  set("--sidebar-accent", `${p.h} ${p.s}% 97%`);
  set("--sidebar-accent-foreground", `${p.h} ${p.s}% ${Math.max(p.l - 9, 30)}%`);

  set("--accent", `${a.h} ${a.s}% ${a.l}%`);
  set("--accent-foreground", accentFg);
}
