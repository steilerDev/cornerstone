/**
 * @jest-environment jsdom
 *
 * Unit tests for AutoItemizePdfPreview (Issue #1821 — previously-untested component).
 *
 * Covers the 7 scenarios from the QA Spec:
 *   1. Initial render (loading state): iframe with correct src/title + loading overlay with Spinner
 *   2. onLoad hides the loading overlay while the iframe remains
 *   3. onErrorCapture shows the fallback region UI
 *   4. Fallback with paperlessUrl set renders the "open in Paperless" link
 *   5. Fallback without paperlessUrl (undefined and null) renders no link
 *   6. Fallback icon is aria-hidden (decorative, no accessible name)
 *   7. Distinct documentId values produce distinct iframe src
 *
 * getDocumentPreviewUrl is a pure string builder (no network) — intentionally not mocked.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import { AutoItemizePdfPreview } from './AutoItemizePdfPreview.js';
import { getDocumentPreviewUrl } from '../../lib/paperlessApi.js';

const t = ((key: string) => key) as unknown as TFunction;

describe('AutoItemizePdfPreview', () => {
  it('renders an iframe with the correct src and title, and shows the loading overlay', () => {
    render(<AutoItemizePdfPreview documentId={42} t={t} />);

    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute('src', getDocumentPreviewUrl(42));
    expect(iframe).toHaveAttribute('title', 'autoItemize.pdfPreviewTitle');

    // Loading overlay is present before onLoad fires
    const overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('hides the loading overlay once the iframe fires onLoad, while the iframe remains', () => {
    render(<AutoItemizePdfPreview documentId={42} t={t} />);

    const iframe = document.querySelector('iframe')!;
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();

    fireEvent.load(iframe);

    expect(document.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeNull();
  });

  it('shows the fallback region when the iframe fires an error event', () => {
    render(<AutoItemizePdfPreview documentId={42} t={t} />);

    const iframe = document.querySelector('iframe')!;
    fireEvent.error(iframe);

    expect(document.querySelector('iframe')).not.toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'autoItemize.previewUnavailable' });
    expect(region).toBeInTheDocument();
    expect(screen.getByText('autoItemize.previewUnavailable')).toBeInTheDocument();
  });

  it('renders an "open in Paperless" link when paperlessUrl is set', () => {
    render(
      <AutoItemizePdfPreview documentId={7} paperlessUrl="https://paperless.example.com" t={t} />,
    );

    fireEvent.error(document.querySelector('iframe')!);

    const link = screen.getByRole('link', { name: 'autoItemize.openInPaperless' });
    expect(link).toHaveAttribute('href', 'https://paperless.example.com/documents/7/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders no link in the fallback when paperlessUrl is undefined', () => {
    render(<AutoItemizePdfPreview documentId={7} t={t} />);

    fireEvent.error(document.querySelector('iframe')!);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('autoItemize.previewUnavailable')).toBeInTheDocument();
  });

  it('renders no link in the fallback when paperlessUrl is null', () => {
    render(<AutoItemizePdfPreview documentId={7} paperlessUrl={null} t={t} />);

    fireEvent.error(document.querySelector('iframe')!);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('autoItemize.previewUnavailable')).toBeInTheDocument();
  });

  it('renders the fallback icon as decorative (aria-hidden, no accessible name)', () => {
    render(<AutoItemizePdfPreview documentId={7} t={t} />);

    fireEvent.error(document.querySelector('iframe')!);

    const region = screen.getByRole('region', { name: 'autoItemize.previewUnavailable' });
    const svg = region.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('aria-label');
    expect(svg).not.toHaveAttribute('role');
  });

  it('produces a distinct iframe src for distinct documentId values', () => {
    const { rerender } = render(<AutoItemizePdfPreview documentId={1} t={t} />);
    expect(document.querySelector('iframe')).toHaveAttribute('src', getDocumentPreviewUrl(1));

    rerender(<AutoItemizePdfPreview documentId={999} t={t} />);
    expect(document.querySelector('iframe')).toHaveAttribute('src', getDocumentPreviewUrl(999));
    expect(getDocumentPreviewUrl(1)).not.toBe(getDocumentPreviewUrl(999));
  });
});
