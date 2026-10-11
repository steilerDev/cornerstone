/**
 * Moves focus to the page heading (making it programmatically focusable on demand). Used when
 * the control that held focus is removed by its own result, so focus never falls to <body>.
 */
export function focusPageHeading(): void {
  const h1 = document.querySelector<HTMLElement>('main h1') ?? document.querySelector('h1');
  if (!h1) return;
  if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1;
  h1.focus();
}

function currentHeading(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1')
  );
}

/**
 * Focuses the heading of the page that is about to replace the current one. The destination
 * (often lazy, or behind a loading state) renders after the navigation, so this waits, frame by
 * frame, for a heading that is not the one on screen now and focuses it; it re-focuses it if a
 * reload drops focus to <body>, and stops as soon as the user moves focus elsewhere. After
 * `maxFrames` without a new heading it falls back to the current one: focus never stays on
 * <body>. Returns a cancel function.
 */
export function focusPageHeadingWhenReady(maxFrames = 60): () => void {
  const stale = currentHeading();
  let focused: HTMLElement | null = null;
  let frames = 0;
  let handle = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const active = document.activeElement;
    if (focused && active && active !== document.body && active !== focused) return;
    const heading = currentHeading();
    if (heading && heading !== stale && active !== heading) {
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      heading.focus();
      focused = heading;
    }
    frames += 1;
    if (frames < maxFrames) {
      handle = window.requestAnimationFrame(tick);
    } else if (!focused) {
      focusPageHeading();
    }
  };

  handle = window.requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(handle);
  };
}
