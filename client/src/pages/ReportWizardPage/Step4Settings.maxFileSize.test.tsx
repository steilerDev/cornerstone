/**
 * Unit tests for the maximum-file-size input in Step4Settings.tsx (story #2161).
 *
 * Uses the real English `budget` bundle (via the globally initialised i18next instance) so the
 * assertions pin the exact user-visible strings.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import type { ResolvedLocale } from '../../contexts/LocaleContext.js';
import { Step4Settings, type MaxFileSizeError } from './Step4Settings.js';

const t = i18n.getFixedT('en', 'budget') as unknown as TFunction;

interface Overrides {
  attachDocuments?: boolean;
  maxFileSize?: string;
  onMaxFileSizeChange?: ((value: string) => void) | null;
  maxFileSizeError?: MaxFileSizeError | null;
}

function renderStep4(overrides: Overrides = {}) {
  const onMaxFileSizeChange =
    overrides.onMaxFileSizeChange === null
      ? undefined
      : (overrides.onMaxFileSizeChange ?? jest.fn());
  render(
    <Step4Settings
      reportLanguage={'en' as ResolvedLocale}
      onReportLanguageChange={jest.fn()}
      attachDocuments={overrides.attachDocuments ?? true}
      onAttachDocumentsChange={jest.fn()}
      includeCoverLetter={false}
      onIncludeCoverLetterChange={jest.fn()}
      coverLetterDisabled={false}
      maxFileSize={overrides.maxFileSize}
      onMaxFileSizeChange={onMaxFileSizeChange}
      maxFileSizeError={overrides.maxFileSizeError}
      t={t}
    />,
  );
  return { onMaxFileSizeChange };
}

describe('Step4Settings — maximum file size', () => {
  it('does not render the limit block when no onMaxFileSizeChange callback is passed', () => {
    renderStep4({ onMaxFileSizeChange: null });

    expect(screen.queryByLabelText('Maximum file size (MB)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Leave empty for a single PDF/)).not.toBeInTheDocument();
  });

  it('renders a labelled text input with the helper text and unit', () => {
    renderStep4({ maxFileSize: '9.5' });

    const input = screen.getByLabelText('Maximum file size (MB)');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveValue('9.5');
    expect(input).toBeEnabled();
    expect(
      screen.getByText(
        'Leave empty for a single PDF without a limit. Larger reports are split into several PDFs.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('MB')).toHaveAttribute('aria-hidden', 'true');
  });

  it('defaults to an empty value', () => {
    renderStep4();

    expect(screen.getByLabelText('Maximum file size (MB)')).toHaveValue('');
  });

  it('reports typed text through onMaxFileSizeChange', () => {
    const { onMaxFileSizeChange } = renderStep4();

    fireEvent.change(screen.getByLabelText('Maximum file size (MB)'), { target: { value: '12' } });

    expect(onMaxFileSizeChange).toHaveBeenCalledTimes(1);
    expect(onMaxFileSizeChange).toHaveBeenCalledWith('12');
  });

  it('is disabled with the "only applies to attached invoice PDFs" hint when attachments are off', () => {
    renderStep4({ attachDocuments: false, maxFileSize: '5' });

    expect(screen.getByLabelText('Maximum file size (MB)')).toBeDisabled();
    expect(screen.getByText('Only applies to attached invoice PDFs.')).toBeInTheDocument();
    expect(screen.queryByText(/Leave empty for a single PDF/)).not.toBeInTheDocument();
  });

  it('hides a validation error while attachments are off', () => {
    renderStep4({ attachDocuments: false, maxFileSize: '0.5', maxFileSizeError: 'min' });

    const input = screen.getByLabelText('Maximum file size (MB)');
    expect(screen.queryByText('The minimum is 1 MB.')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('has no error, aria-invalid or error id in aria-describedby when valid', () => {
    renderStep4({ maxFileSize: '10', maxFileSizeError: null });

    const input = screen.getByLabelText('Maximum file size (MB)');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.getAttribute('aria-describedby')).toBe('maxFileSizeHelper');
    expect(document.getElementById('maxFileSizeError')).toBeNull();
  });

  it.each<[MaxFileSizeError, string]>([
    ['invalid', 'Enter a positive number, for example 10 or 9.5.'],
    ['min', 'The minimum is 1 MB.'],
    ['decimals', 'Use at most one decimal place.'],
  ])('shows the "%s" error text and wires aria-invalid and aria-describedby', (reason, message) => {
    renderStep4({ maxFileSize: 'x', maxFileSizeError: reason });

    const input = screen.getByLabelText('Maximum file size (MB)');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe('maxFileSizeHelper maxFileSizeError');
    const error = screen.getByText(message);
    expect(error.id).toBe('maxFileSizeError');
    expect(input).toHaveAccessibleDescription(
      `Leave empty for a single PDF without a limit. Larger reports are split into several PDFs. ${message}`,
    );
  });
});
