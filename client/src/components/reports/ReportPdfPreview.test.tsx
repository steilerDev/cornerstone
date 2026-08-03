/**
 * Unit tests for client/src/components/reports/ReportPdfPreview.tsx
 *
 * Covers: loading overlay/aria-busy, iframe src wiring, failure fallback + retry, aria-busy.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import { ReportPdfPreview } from './ReportPdfPreview.js';

const t = ((key: string) => key) as unknown as TFunction;

describe('ReportPdfPreview', () => {
  it('renders an iframe with the given blob URL and a title', () => {
    render(
      <ReportPdfPreview
        blobUrl="blob:mock-url"
        isRegenerating={false}
        hasError={false}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute('src', 'blob:mock-url');
    expect(iframe).toHaveAttribute('title', 'sourceReports.pdfPreviewTitle');
  });

  it('does not render an iframe when blobUrl is null', () => {
    render(
      <ReportPdfPreview
        blobUrl={null}
        isRegenerating={false}
        hasError={false}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('shows the loading overlay with a spinner while isRegenerating is true', () => {
    render(
      <ReportPdfPreview
        blobUrl="blob:mock-url"
        isRegenerating={true}
        hasError={false}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    const overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('does not show the loading overlay when isRegenerating is false', () => {
    render(
      <ReportPdfPreview
        blobUrl="blob:mock-url"
        isRegenerating={false}
        hasError={false}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('sets aria-busy="true" on the wrapper while regenerating', () => {
    const { container } = render(
      <ReportPdfPreview
        blobUrl="blob:mock-url"
        isRegenerating={true}
        hasError={false}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('sets aria-busy="false" on the wrapper when not regenerating', () => {
    const { container } = render(
      <ReportPdfPreview
        blobUrl="blob:mock-url"
        isRegenerating={false}
        hasError={false}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    expect(container.querySelector('[aria-busy="false"]')).not.toBeNull();
  });

  it('shows the failure fallback region instead of the iframe when hasError is true', () => {
    render(
      <ReportPdfPreview
        blobUrl="blob:mock-url"
        isRegenerating={false}
        hasError={true}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'sourceReports.previewGenerationFailed' }),
    ).toBeInTheDocument();
  });

  it('calls onRetry when the retry button in the failure fallback is clicked', () => {
    const onRetry = jest.fn();
    render(
      <ReportPdfPreview
        blobUrl={null}
        isRegenerating={false}
        hasError={true}
        onRetry={onRetry}
        t={t}
      />,
    );
    // `t` here is the identity mock (`(key) => key`), so the accessible name is the raw key as
    // literally passed to `t()`. Production now calls `t('common:button.retry')` — the correct
    // cross-namespace colon separator, resolved to real translated text ("Retry") by react-i18next
    // at runtime — so the identity mock echoes it back verbatim with the colon.
    fireEvent.click(screen.getByRole('button', { name: 'common:button.retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('the error icon is decorative (aria-hidden, no accessible name)', () => {
    render(
      <ReportPdfPreview
        blobUrl={null}
        isRegenerating={false}
        hasError={true}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the failure fallback even while isRegenerating is true (hasError takes priority)', () => {
    render(
      <ReportPdfPreview
        blobUrl={null}
        isRegenerating={true}
        hasError={true}
        onRetry={jest.fn()}
        t={t}
      />,
    );
    expect(screen.getByRole('button', { name: 'common:button.retry' })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy]')).not.toBeInTheDocument();
  });
});
