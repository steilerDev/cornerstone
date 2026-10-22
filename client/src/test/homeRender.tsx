import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LocaleProvider } from '../contexts/LocaleContext.js';
import { ToastProvider, useToast } from '../components/Toast/ToastContext.js';
import { CaptureUploadsContext } from '../capture/captureUploadsContext.js';
import { makeEngine } from './captureFixtures.js';

/** Lists the open toasts as text ("error: message") so tests can read them. */
export function ToastList() {
  const { toasts } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id}>{`${toast.variant}: ${toast.message}`}</li>
      ))}
    </ul>
  );
}

/** Shows the router location so tests can assert where a click went. */
export function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>
  );
}

export interface HomeRenderOptions {
  route?: string;
  /** Extra providers around the UI (inside the router). */
  wrap?: (children: ReactNode) => ReactNode;
}

/** Renders a Home piece with the locale, toast and router providers it needs. */
export function renderHome(ui: ReactElement, { route = '/', wrap }: HomeRenderOptions = {}) {
  const inner = (
    <>
      <ToastList />
      <LocationProbe />
      {ui}
    </>
  );
  const engine = makeEngine();
  return render(
    <LocaleProvider>
      <ToastProvider>
        <CaptureUploadsContext value={engine.api}>
          <MemoryRouter initialEntries={[route]}>{wrap ? wrap(inner) : inner}</MemoryRouter>
        </CaptureUploadsContext>
      </ToastProvider>
    </LocaleProvider>,
  );
}
