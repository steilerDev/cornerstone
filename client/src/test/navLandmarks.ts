/**
 * Navigation landmarks a page renders itself, i.e. every `<nav>` / role="navigation" that is not
 * the breadcrumb trail. Since #2205 views live in the sidebar only, so a page owns none (AC5).
 */
export function ownNavigations(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('nav, [role="navigation"]')).filter(
    (el) => el.closest('[data-testid="breadcrumbs"]') === null,
  );
}
