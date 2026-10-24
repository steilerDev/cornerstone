import { useEffect, useState, type RefObject } from 'react';

/**
 * True while the element is at least `minPx` wide (the list's table surface). True when
 * ResizeObserver is missing (jsdom), so the table surface is the default there.
 */
export function useContainerWide(ref: RefObject<HTMLElement | null>, minPx = 768): boolean {
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setWide(entry.contentRect.width >= minPx);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, minPx]);

  return wide;
}
