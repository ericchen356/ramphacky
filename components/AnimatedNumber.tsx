"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Smoothly tweens between numeric values without re-rendering React on each frame. */
export default function AnimatedNumber({
  value,
  format,
  duration = 0.9,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });
  const reduce = useReducedMotion();
  // Static initial text: React never rewrites it, so tweens own the DOM text afterwards.
  const [initial] = useState(() => format(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    if (reduce || from === value) {
      prev.current = value;
      el.textContent = fmt.current(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        prev.current = v;
        el.textContent = fmt.current(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {initial}
    </span>
  );
}
