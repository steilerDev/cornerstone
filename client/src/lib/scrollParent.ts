/**
 * Returns the nearest ancestor of `el` whose computed overflow-y makes it a scroll
 * container (`auto` | `scroll` | `overlay`), or null when the document/viewport scrolls.
 * Used as the IntersectionObserver root for lists rendered inside scrolling modals.
 */
export function findScrollParent(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
