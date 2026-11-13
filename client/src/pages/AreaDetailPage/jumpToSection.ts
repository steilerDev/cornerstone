/**
 * Scrolls a section of the page into view and moves focus to its h2 (strip facts that point at a
 * section further down). Smooth scrolling is off under `prefers-reduced-motion`.
 */
export function jumpToSection(id: string): void {
  const section = document.getElementById(id);
  if (!section) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  section.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  const heading = section.querySelector<HTMLElement>('h2');
  if (heading) {
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
