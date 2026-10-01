/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render, act } from '@testing-library/react';
import i18n from '../../../i18n/index.js';
import { DiaryEntryTypeBadge } from './DiaryEntryTypeBadge.js';

describe('DiaryEntryTypeBadge', () => {
  beforeEach(() => {
    localStorage.setItem('theme', 'light');
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ─── Manual types — distinct emoji ─────────────────────────────────────────

  it('renders 📋 for daily_log type', () => {
    render(<DiaryEntryTypeBadge entryType="daily_log" />);
    const badge = screen.getByTestId('diary-type-badge-daily_log');
    expect(badge.textContent).toBe('📋');
  });

  it('renders 🔍 for site_visit type', () => {
    render(<DiaryEntryTypeBadge entryType="site_visit" />);
    const badge = screen.getByTestId('diary-type-badge-site_visit');
    expect(badge.textContent).toBe('🔍');
  });

  it('renders 📦 for delivery type', () => {
    render(<DiaryEntryTypeBadge entryType="delivery" />);
    const badge = screen.getByTestId('diary-type-badge-delivery');
    expect(badge.textContent).toBe('📦');
  });

  it('renders ⚠️ for issue type', () => {
    render(<DiaryEntryTypeBadge entryType="issue" />);
    const badge = screen.getByTestId('diary-type-badge-issue');
    expect(badge.textContent).toBe('⚠️');
  });

  it('renders 📝 for general_note type', () => {
    render(<DiaryEntryTypeBadge entryType="general_note" />);
    const badge = screen.getByTestId('diary-type-badge-general_note');
    expect(badge.textContent).toBe('📝');
  });

  // ─── Automatic types — all use ⚙️ ──────────────────────────────────────────

  it('renders ⚙️ for work_item_status (automatic)', () => {
    render(<DiaryEntryTypeBadge entryType="work_item_status" />);
    const badge = screen.getByTestId('diary-type-badge-work_item_status');
    expect(badge.textContent).toBe('⚙️');
  });

  it('renders ⚙️ for invoice_status (automatic)', () => {
    render(<DiaryEntryTypeBadge entryType="invoice_status" />);
    const badge = screen.getByTestId('diary-type-badge-invoice_status');
    expect(badge.textContent).toBe('⚙️');
  });

  it('renders ⚙️ for milestone_delay (automatic)', () => {
    render(<DiaryEntryTypeBadge entryType="milestone_delay" />);
    const badge = screen.getByTestId('diary-type-badge-milestone_delay');
    expect(badge.textContent).toBe('⚙️');
  });

  it('renders ⚙️ for budget_breach (automatic)', () => {
    render(<DiaryEntryTypeBadge entryType="budget_breach" />);
    const badge = screen.getByTestId('diary-type-badge-budget_breach');
    expect(badge.textContent).toBe('⚙️');
  });

  it('renders ⚙️ for auto_reschedule (automatic)', () => {
    render(<DiaryEntryTypeBadge entryType="auto_reschedule" />);
    const badge = screen.getByTestId('diary-type-badge-auto_reschedule');
    expect(badge.textContent).toBe('⚙️');
  });

  it('renders ⚙️ for subsidy_status (automatic)', () => {
    render(<DiaryEntryTypeBadge entryType="subsidy_status" />);
    const badge = screen.getByTestId('diary-type-badge-subsidy_status');
    expect(badge.textContent).toBe('⚙️');
  });

  // ─── title attribute ────────────────────────────────────────────────────────

  it('has title attribute matching the entry type label', () => {
    render(<DiaryEntryTypeBadge entryType="daily_log" />);
    const badge = screen.getByTestId('diary-type-badge-daily_log');
    expect(badge).toHaveAttribute('title', 'Daily Log');
  });

  it('has title "Site Visit" for site_visit', () => {
    render(<DiaryEntryTypeBadge entryType="site_visit" />);
    expect(screen.getByTestId('diary-type-badge-site_visit')).toHaveAttribute(
      'title',
      'Site Visit',
    );
  });

  it.each([
    ['daily_log', 'Daily Log'],
    ['site_visit', 'Site Visit'],
    ['delivery', 'Delivery'],
    ['issue', 'Issue'],
    ['general_note', 'General Note'],
    ['work_item_status', 'Work Item Status'],
    ['invoice_status', 'Invoice Status'],
    ['invoice_created', 'Invoice Created'],
    ['milestone_delay', 'Milestone Delay'],
    ['budget_breach', 'Budget Breach'],
    ['auto_reschedule', 'Auto Reschedule'],
    ['subsidy_status', 'Subsidy Status'],
  ] as const)('title and aria-label come from diary:entryTypes for %s', (type, label) => {
    render(<DiaryEntryTypeBadge entryType={type} />);
    const badge = screen.getByTestId(`diary-type-badge-${type}`);
    expect(badge).toHaveAttribute('title', label);
    expect(badge).toHaveAttribute('aria-label', `Entry type: ${label}`);
  });

  it('shows the German label and aria-label when the language is German', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    try {
      render(<DiaryEntryTypeBadge entryType="general_note" />);
      const badge = screen.getByTestId('diary-type-badge-general_note');
      expect(badge).toHaveAttribute('title', 'Allgemeine Notiz');
      expect(badge).toHaveAttribute('aria-label', 'Eintragstyp: Allgemeine Notiz');
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  // ─── size prop ─────────────────────────────────────────────────────────────

  it('applies sizeSm class by default (no size prop)', () => {
    render(<DiaryEntryTypeBadge entryType="daily_log" />);
    const badge = screen.getByTestId('diary-type-badge-daily_log');
    const classAttr = badge.getAttribute('class') ?? '';
    expect(classAttr).toContain('sizeSm');
    expect(classAttr).not.toContain('sizeLg');
  });

  it('applies sizeLg class when size="lg"', () => {
    render(<DiaryEntryTypeBadge entryType="daily_log" size="lg" />);
    const badge = screen.getByTestId('diary-type-badge-daily_log');
    const classAttr = badge.getAttribute('class') ?? '';
    expect(classAttr).toContain('sizeLg');
    expect(classAttr).not.toContain('sizeSm');
  });

  it('applies sizeSm class when size="sm"', () => {
    render(<DiaryEntryTypeBadge entryType="issue" size="sm" />);
    const badge = screen.getByTestId('diary-type-badge-issue');
    const classAttr = badge.getAttribute('class') ?? '';
    expect(classAttr).toContain('sizeSm');
  });
});
