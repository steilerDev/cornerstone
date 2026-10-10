import { useEffect, useState } from 'react';

interface Shown {
  readonly key: string;
  readonly title: string | null;
}

/**
 * The page's h1 text once that heading has scrolled up under the header, else null.
 * Null as well when the observers are unavailable (jsdom) or the page has no h1.
 */
export function useScrolledPastHeading(
  header: HTMLElement | null,
  resetKey: string,
): string | null {
  const [shown, setShown] = useState<Shown>({ key: resetKey, title: null });

  useEffect(() => {
    if (
      !header ||
      typeof IntersectionObserver === 'undefined' ||
      typeof MutationObserver === 'undefined'
    ) {
      return;
    }
    const main = document.querySelector('main');
    if (!main) return;

    let heading: HTMLHeadingElement | null = null;
    let intersection: IntersectionObserver | null = null;
    let scrolledPast = false;
    let last: string | null = null;

    const publish = () => {
      const text = heading?.textContent.trim() ?? '';
      const title = scrolledPast && text ? text : null;
      if (title === last) return;
      last = title;
      setShown({ key: resetKey, title });
    };

    const attach = () => {
      const next = main.querySelector('h1');
      if (next === heading) {
        if (scrolledPast) publish();
        return;
      }
      intersection?.disconnect();
      heading = next;
      scrolledPast = false;
      if (!heading) {
        publish();
        return;
      }
      const height = Math.round(header.getBoundingClientRect().height);
      intersection = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          const top = entry.rootBounds?.top ?? header.getBoundingClientRect().bottom;
          scrolledPast = !entry.isIntersecting && entry.boundingClientRect.bottom <= top;
          publish();
        },
        { rootMargin: `-${height}px 0px 0px 0px`, threshold: 0 },
      );
      intersection.observe(heading);
    };

    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(main, { childList: true, subtree: true, characterData: true });

    return () => {
      mutations.disconnect();
      intersection?.disconnect();
    };
  }, [header, resetKey]);

  return shown.key === resetKey ? shown.title : null;
}
