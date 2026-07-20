import React, { useEffect, useRef, useState } from "react";

// A number that tweens toward its target whenever the target CHANGES (not just
// once on mount like StatCard). Drives the "sube el número" living-dashboard
// feel — every poll/realtime bump counts up smoothly.

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

export const LiveNumber: React.FC<Props> = ({ value, duration = 700, format, className }) => {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value); // always holds the currently-shown value
  const rafRef = useRef<number>();

  useEffect(() => {
    // Start each tween from what is CURRENTLY on screen — interrupting a tween
    // mid-flight continues from where it visually is, not from a stale target.
    const from = displayRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const current = from + (to - from) * easeOutCubic(p);
      displayRef.current = current;
      setDisplay(current);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        displayRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const rounded = Math.round(display);
  return <span className={className}>{format ? format(rounded) : rounded.toLocaleString()}</span>;
};
