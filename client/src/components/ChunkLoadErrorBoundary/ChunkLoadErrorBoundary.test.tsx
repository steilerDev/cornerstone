/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Must mock BEFORE any static imports that reference the mocked module.
// ChunkLoadErrorBoundary imports '../../i18n/index.js' — stub it to avoid
// running the full i18next initialisation in the jsdom environment.
jest.unstable_mockModule('../../i18n/index.js', () => ({
  default: {
    t: (key: string) => key,
  },
}));

// CSS modules are handled by identity-obj-proxy (jest.config.ts moduleNameMapper).
// No explicit mock needed for shared.module.css.

// ---------------------------------------------------------------------------
// window.location.reload observability note
// ---------------------------------------------------------------------------
// jsdom defines window.location.reload as a non-configurable, non-writable
// property on the Location instance, so neither Object.defineProperty nor
// jest.spyOn can replace it.
//
// When reload() is called, jsdom dispatches a navigation request which it
// cannot implement and logs to console.error:
//   "Not implemented: navigation (except hash changes)"
//
// We therefore:
// 1. Assert sessionStorage['cornerstone:chunk-reload'] is set (proves componentDidCatch
//    ran and decided to call reload — sessionStorage.setItem fires just before reload())
// 2. Assert console.error was called with the "Not implemented: navigation" message
//    (proves window.location.reload() was actually invoked)
//
// This two-signal approach matches the pattern used in AuthContext.test.tsx for
// window.location.assign().
// ---------------------------------------------------------------------------

const CHUNK_RELOAD_KEY = 'cornerstone:chunk-reload';
const JSDOM_NAVIGATION_ERROR = /Not implemented.*navigation/i;

// Local type alias for the dynamically-imported class. Using `import()` type
// annotation in variable declarations is disallowed by the
// @typescript-eslint/consistent-type-imports rule, so we model the shape
// with React.ComponentClass directly.
type ChunkLoadErrorBoundaryClass = React.ComponentClass<{ children: React.ReactNode }>;

describe('ChunkLoadErrorBoundary', () => {
  let ChunkLoadErrorBoundary: ChunkLoadErrorBoundaryClass;

  // console.error spy — installed per-test so each test can make its own assertions
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(async () => {
    // Dynamic import so the jest.unstable_mockModule above is registered first
    if (!ChunkLoadErrorBoundary) {
      const mod = await import('./ChunkLoadErrorBoundary.js');
      ChunkLoadErrorBoundary = mod.ChunkLoadErrorBoundary;
    }

    // Clear sessionStorage between tests
    sessionStorage.clear();

    // Suppress ALL console.error output (React error boundary noise + jsdom navigation)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // Helper: a child that throws the supplied error on render.
  // Return type is `never` because it always throws — `never` is a valid
  // subtype of ReactNode so TypeScript accepts it as a JSX component return type.
  function ThrowingChild({ error }: { error: Error }): never {
    throw error;
  }

  // Helper: a child that renders safely
  function SafeChild() {
    return <div data-testid="safe-child">content</div>;
  }

  /** Assert that componentDidCatch triggered a reload attempt.
   *
   * Two signals:
   * 1. sessionStorage key is set to 'true' (fires just before reload())
   * 2. console.error was called with jsdom's "Not implemented: navigation" message
   *    (fires when window.location.reload() invokes jsdom's navigation stub)
   */
  async function assertReloadAttempted() {
    // componentDidCatch is called asynchronously via React's update-callback
    // mechanism. waitFor retries until both signals are observed.
    await waitFor(() => {
      expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('true');
    });
    const navigationError = (consoleErrorSpy.mock.calls as unknown[][]).find((args) =>
      args.some((arg) => JSDOM_NAVIGATION_ERROR.test(String(arg))),
    );
    expect(navigationError).toBeDefined();
  }

  it('renders children when no error is thrown', () => {
    render(
      <ChunkLoadErrorBoundary>
        <SafeChild />
      </ChunkLoadErrorBoundary>,
    );

    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
  });

  it('error with name === "ChunkLoadError" triggers reload and sets sessionStorage key', async () => {
    const chunkError = Object.assign(new Error('chunk 123 failed'), { name: 'ChunkLoadError' });

    render(
      <ChunkLoadErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkLoadErrorBoundary>,
    );

    await assertReloadAttempted();
  });

  it('error matching /Loading chunk .* failed/ triggers reload', async () => {
    const error = new Error('Loading chunk 123 failed.');

    render(
      <ChunkLoadErrorBoundary>
        <ThrowingChild error={error} />
      </ChunkLoadErrorBoundary>,
    );

    await assertReloadAttempted();
  });

  it('error matching /Loading CSS chunk .* failed/ triggers reload', async () => {
    const error = new Error('Loading CSS chunk 456 failed.');

    render(
      <ChunkLoadErrorBoundary>
        <ThrowingChild error={error} />
      </ChunkLoadErrorBoundary>,
    );

    await assertReloadAttempted();
  });

  it('error matching /Failed to fetch dynamically imported module/ triggers reload', async () => {
    const error = new Error('Failed to fetch dynamically imported module: /x.js');

    render(
      <ChunkLoadErrorBoundary>
        <ThrowingChild error={error} />
      </ChunkLoadErrorBoundary>,
    );

    await assertReloadAttempted();
  });

  it('when session guard key is already set, chunk error does NOT trigger reload and renders fallback alert', async () => {
    // Pre-set the guard key to simulate a previous reload that did not fix the problem
    sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true');

    const chunkError = new Error('Loading chunk 99 failed.');

    render(
      <ChunkLoadErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkLoadErrorBoundary>,
    );

    // Wait for the fallback UI to appear (confirms the boundary did catch the error)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // sessionStorage key should remain 'true' but NOT have triggered navigation
    // (no "Not implemented: navigation" message in console.error)
    const navigationError = (consoleErrorSpy.mock.calls as unknown[][]).find((args) =>
      args.some((arg) => JSDOM_NAVIGATION_ERROR.test(String(arg))),
    );
    expect(navigationError).toBeUndefined();
  });

  it('non-chunk error is re-thrown and does NOT trigger reload or set sessionStorage', () => {
    const runtimeError = new Error('Normal runtime error');

    // getDerivedStateFromError re-throws for non-chunk errors, which propagates
    // out of React's error boundary mechanism as an uncaught render error.
    expect(() => {
      render(
        <ChunkLoadErrorBoundary>
          <ThrowingChild error={runtimeError} />
        </ChunkLoadErrorBoundary>,
      );
    }).toThrow('Normal runtime error');

    // Neither sessionStorage nor navigation should have been touched
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    const navigationError = (consoleErrorSpy.mock.calls as unknown[][]).find((args) =>
      args.some((arg) => JSDOM_NAVIGATION_ERROR.test(String(arg))),
    );
    expect(navigationError).toBeUndefined();
  });

  it('isChunkLoadError returns false for non-Error values (line 10 coverage)', () => {
    // Throw a non-Error value (a string). getDerivedStateFromError receives it,
    // isChunkLoadError hits the `!(error instanceof Error) → return false` branch,
    // and re-throws it — causing the render to throw.
    function ThrowString(): never {
      throw 'not-an-error-object';
    }

    expect(() => {
      render(
        <ChunkLoadErrorBoundary>
          <ThrowString />
        </ChunkLoadErrorBoundary>,
      );
    }).toThrow('not-an-error-object');

    // No sessionStorage mutation, no navigation
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });

  it('fallback refresh button triggers window.location.reload when clicked', async () => {
    // Pre-set guard key so fallback UI renders instead of reloading
    sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true');

    const chunkError = new Error('Loading chunk 1 failed.');

    render(
      <ChunkLoadErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkLoadErrorBoundary>,
    );

    // Wait for the fallback UI to render
    const alertEl = await screen.findByRole('alert');
    expect(alertEl).toBeInTheDocument();

    // Before clicking the button, no navigation should have occurred
    const preClickNavErrors = (consoleErrorSpy.mock.calls as unknown[][]).filter((args) =>
      args.some((arg) => JSDOM_NAVIGATION_ERROR.test(String(arg))),
    );
    expect(preClickNavErrors).toHaveLength(0);

    // Click the refresh button
    const refreshButton = screen.getByRole('button');
    fireEvent.click(refreshButton);

    // After clicking, jsdom should log "Not implemented: navigation"
    await waitFor(() => {
      const navErrors = (consoleErrorSpy.mock.calls as unknown[][]).filter((args) =>
        args.some((arg) => JSDOM_NAVIGATION_ERROR.test(String(arg))),
      );
      expect(navErrors.length).toBeGreaterThan(0);
    });
  });
});
