/**
 * Shared render harness for the attention tests (#2230): locale, toasts, capture engine and a
 * recording router. `ToastList` prints every toast and offers its Undo.
 */
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { CaptureUploadsContext } from '../capture/captureUploadsContext.js';
import { ToastProvider, useToast } from '../components/Toast/ToastContext.js';
import { LocaleProvider } from '../contexts/LocaleContext.js';
import { makeEngine } from './captureFixtures.js';
import type { FakeEngine } from './captureFixtures.js';
import { RecordingRouter, createRouterLog } from './recordingRouter.js';
import type { RouterLog } from './recordingRouter.js';

export function ToastList() {
  const { toasts, undoToast } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id} data-testid={`toast-item-${toast.variant}`}>
          <span>{`${toast.variant}: ${toast.message}`}</span>
          {toast.variant === 'undo' ? (
            <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
              Undo
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface AttentionRender {
  engine: FakeEngine;
  log: RouterLog;
}

export function renderInAttentionProviders(
  ui: ReactNode,
  options: { engine?: FakeEngine; entries?: string[] } = {},
): AttentionRender {
  const engine = options.engine ?? makeEngine();
  const log = createRouterLog();
  render(
    <LocaleProvider>
      <ToastProvider>
        <CaptureUploadsContext value={engine.api}>
          <RecordingRouter entries={options.entries ?? ['/']} log={log}>
            <ToastList />
            {ui}
          </RecordingRouter>
        </CaptureUploadsContext>
      </ToastProvider>
    </LocaleProvider>,
  );
  return { engine, log };
}
