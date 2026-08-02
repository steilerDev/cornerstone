/**
 * Unit tests for client/src/pages/ReportWizardPage/Step4Settings.tsx
 *
 * Covers: the language radio group (literal, non-translated "English"/"Deutsch" labels per
 * ProfilePage precedent — NOT wrapped in t()), checked-state reflecting the reportLanguage prop,
 * onReportLanguageChange wiring, the group's accessible name (aria-labelledby the translated
 * heading), the helper text, and the two document-option toggles ported verbatim from
 * Step4Options.test.tsx (attachDocuments / includeCoverLetter — disabled-with-title-hint cover
 * letter checkbox included) since Step4Settings absorbed them from the old Step4Options.
 *
 * Story #1901 had added an "Enable AI assistance" toggle here (aiEnabled/llmEnabled/
 * onAiEnabledChange props). Story #1931 removed it entirely: the double opt-in it created (toggle
 * here, then a separate button on step 5) added a step without adding information — llmEnabled
 * alone already gates the step-5 action. This file no longer has any AI-related props or tests.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { ResolvedLocale } from '../../contexts/LocaleContext.js';
import { Step4Settings } from './Step4Settings.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

function baseProps() {
  return {
    reportLanguage: 'en' as ResolvedLocale,
    onReportLanguageChange: jest.fn(),
    attachDocuments: true,
    onAttachDocumentsChange: jest.fn(),
    includeCoverLetter: false,
    onIncludeCoverLetterChange: jest.fn(),
    coverLetterDisabled: false,
    t,
  };
}

function renderStep4Settings(props: ReturnType<typeof baseProps> & Record<string, unknown>) {
  return render(<Step4Settings {...props} />);
}

describe('Step4Settings', () => {
  describe('language radio group', () => {
    it('renders literal, non-translated "English" and "Deutsch" labels', () => {
      renderStep4Settings(baseProps());
      // Literal text via getByText — these labels are intentionally NOT wrapped in t() (autonyms,
      // matching ProfilePage precedent), so asserting on the raw literal string is the correct
      // check here (not a translation-key echo like the rest of this component's copy).
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('Deutsch')).toBeInTheDocument();
    });

    it('checks the "en" radio and leaves "de" unchecked when reportLanguage is "en"', () => {
      renderStep4Settings({ ...baseProps(), reportLanguage: 'en' });
      const enRadio = screen.getByRole('radio', { name: 'English' }) as HTMLInputElement;
      const deRadio = screen.getByRole('radio', { name: 'Deutsch' }) as HTMLInputElement;
      expect(enRadio.checked).toBe(true);
      expect(deRadio.checked).toBe(false);
    });

    it('checks the "de" radio and leaves "en" unchecked when reportLanguage is "de"', () => {
      renderStep4Settings({ ...baseProps(), reportLanguage: 'de' });
      const enRadio = screen.getByRole('radio', { name: 'English' }) as HTMLInputElement;
      const deRadio = screen.getByRole('radio', { name: 'Deutsch' }) as HTMLInputElement;
      expect(enRadio.checked).toBe(false);
      expect(deRadio.checked).toBe(true);
    });

    it('both radios share the name "reportLanguage" (mutually exclusive group)', () => {
      renderStep4Settings(baseProps());
      const enRadio = screen.getByRole('radio', { name: 'English' });
      const deRadio = screen.getByRole('radio', { name: 'Deutsch' });
      expect(enRadio).toHaveAttribute('name', 'reportLanguage');
      expect(deRadio).toHaveAttribute('name', 'reportLanguage');
    });

    it('calls onReportLanguageChange("de") when the Deutsch radio is clicked', () => {
      const onReportLanguageChange = jest.fn();
      renderStep4Settings({ ...baseProps(), reportLanguage: 'en', onReportLanguageChange });
      fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
      expect(onReportLanguageChange).toHaveBeenCalledWith('de');
    });

    it('calls onReportLanguageChange("en") when the English radio is clicked', () => {
      const onReportLanguageChange = jest.fn();
      renderStep4Settings({ ...baseProps(), reportLanguage: 'de', onReportLanguageChange });
      fireEvent.click(screen.getByRole('radio', { name: 'English' }));
      expect(onReportLanguageChange).toHaveBeenCalledWith('en');
    });

    it('the radio group has an accessible name resolving to the translated language heading', () => {
      renderStep4Settings(baseProps());
      // aria-labelledby="report-language-heading" points at the <h3> whose content is
      // t('sourceReports.settingsStep.languageHeading') — with the echoing stub `t` above, that
      // resolves to the raw key string, which is exactly what the group's accessible name should
      // equal.
      expect(
        screen.getByRole('group', { name: 'sourceReports.settingsStep.languageHeading' }),
      ).toBeInTheDocument();
    });

    it('renders the language helper text', () => {
      renderStep4Settings(baseProps());
      expect(screen.getByText('sourceReports.settingsStep.languageHelper')).toBeInTheDocument();
    });
  });

  // ─── Document option toggles (ported from Step4Options.test.tsx) ────────────

  describe('document option toggles', () => {
    it('renders both option checkboxes with the given checked state', () => {
      renderStep4Settings({ ...baseProps(), attachDocuments: true, includeCoverLetter: false });
      const attach = screen.getByLabelText('sourceReports.attachDocuments') as HTMLInputElement;
      const cover = screen.getByLabelText('sourceReports.includeCoverLetter') as HTMLInputElement;
      expect(attach.checked).toBe(true);
      expect(cover.checked).toBe(false);
    });

    it('calls onAttachDocumentsChange with the new checked value when toggled', () => {
      const onAttachDocumentsChange = jest.fn();
      renderStep4Settings({
        ...baseProps(),
        attachDocuments: true,
        onAttachDocumentsChange,
      });
      fireEvent.click(screen.getByLabelText('sourceReports.attachDocuments'));
      expect(onAttachDocumentsChange).toHaveBeenCalledWith(false);
    });

    it('calls onIncludeCoverLetterChange with the new checked value when toggled', () => {
      const onIncludeCoverLetterChange = jest.fn();
      renderStep4Settings({
        ...baseProps(),
        includeCoverLetter: false,
        coverLetterDisabled: false,
        onIncludeCoverLetterChange,
      });
      fireEvent.click(screen.getByLabelText('sourceReports.includeCoverLetter'));
      expect(onIncludeCoverLetterChange).toHaveBeenCalledWith(true);
    });

    it('disables the cover-letter checkbox and shows a title hint when coverLetterDisabled is true', () => {
      renderStep4Settings({ ...baseProps(), coverLetterDisabled: true });
      const cover = screen.getByLabelText('sourceReports.includeCoverLetter') as HTMLInputElement;
      expect(cover.disabled).toBe(true);
      expect(cover).toHaveAttribute('title', 'sourceReports.coverLetterDisabledReason');
    });

    it('leaves the cover-letter checkbox enabled with no title hint when coverLetterDisabled is false', () => {
      renderStep4Settings({ ...baseProps(), coverLetterDisabled: false });
      const cover = screen.getByLabelText('sourceReports.includeCoverLetter') as HTMLInputElement;
      expect(cover.disabled).toBe(false);
      expect(cover).not.toHaveAttribute('title');
    });
  });

  // ─── No AI-assistance control anywhere on this step (Story #1931, AC 1.1/1.3) ──

  describe('no AI-assistance control (#1931)', () => {
    it('renders no checkbox or control referencing AI assistance, regardless of any extra props passed', () => {
      // Pass the old prop names through even though the component no longer declares them in its
      // type — if a stray conditional referencing them were ever reintroduced, this would catch
      // it rendering something. The component itself takes no llmEnabled/aiEnabled prop anymore.
      renderStep4Settings({
        ...baseProps(),
        llmEnabled: true,
        aiEnabled: true,
      } as ReturnType<typeof baseProps> & Record<string, unknown>);
      expect(screen.queryByText(/enable ai assistance/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText('sourceReports.settingsStep.enableAiAssistance'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('sourceReports.settingsStep.enableAiAssistanceHelper'),
      ).not.toBeInTheDocument();
      // Only the two known document-option checkboxes exist — no third (AI) checkbox.
      expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    });
  });
});
