'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Número que corre hasta su valor nuevo en vez de saltar. Cuando cambia por
 * un evento en vivo (alguien reservó), se nota que cambió.
 */
export function AnimatedNumber({ value, ms = 700, className }: { value: number; ms?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      from.current = b;
      setShown(b);
      return;
    }
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (b - a) * e);
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = b;
    };
  }, [value, ms]);

  return <span className={className}>{shown}</span>;
}
