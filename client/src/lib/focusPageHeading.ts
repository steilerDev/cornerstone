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
