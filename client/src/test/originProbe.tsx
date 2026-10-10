import { useLocation } from 'react-router-dom';
import { screen } from '@testing-library/react';

/**
 * Test helper for the origin-state convention (#2202): render next to the component under test
 * inside a router, click a link, then read where it went and which origin state it carried.
 */
export function OriginProbe() {
  const { pathname, search, state } = useLocation();
  return (
    <>
      <div data-testid="probe-path">{pathname}</div>
      <div data-testid="probe-search">{search}</div>
      <div data-testid="probe-state">{JSON.stringify(state)}</div>
    </>
  );
}

export interface ProbedOrigin {
  readonly to: string;
  readonly name?: string;
}

/** The `origin` carried by the last navigation (null when the link carried no origin state). */
export function probedOrigin(): ProbedOrigin | null {
  const raw = screen.getByTestId('probe-state').textContent;
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { origin?: ProbedOrigin } | null;
  return parsed?.origin ?? null;
}

export function probedPath(): string {
  return screen.getByTestId('probe-path').textContent ?? '';
}
