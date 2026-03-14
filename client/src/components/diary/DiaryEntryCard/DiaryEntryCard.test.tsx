/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { DiaryEntryCard } from './DiaryEntryCard.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const manualEntry: DiaryEntrySummary = {
  id: 'de-manual-1',
  entryType: 'daily_log',
  entryDate: '2026-03-14',
  title: 'Daily Site Log',
  body: 'Poured concrete foundations and inspected rebar placement.',
  metadata: null,
  isAutomatic: false,
  sourceEntityType: null,
  sourceEntityId: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:30:00.000Z',
  updatedAt: '2026-03-14T09:30:00.000Z',
};

const automaticEntry: DiaryEntrySummary = {
  id: 'de-auto-1',
  entryType: 'work_item_status',
  entryDate: '2026-03-14',
  title: null,
  body: 'Work item "Kitchen Installation" changed status to in_progress.',
  metadata: {
    changeSummary: 'Status changed to in_progress',
    previousValue: 'not_started',
    newValue: 'in_progress',
  },
  isAutomatic: true,
  sourceEntityType: 'work_item',
  sourceEntityId: 'wi-kitchen-1',
  photoCount: 0,
  createdBy: null,
  createdAt: '2026-03-14T10:00:00.000Z',
  updatedAt: '2026-03-14T10:00:00.000Z',
};

describe('DiaryEntryCard', () => {
  beforeEach(() => {
    localStorage.setItem('theme', 'light');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderCard = (entry: DiaryEntrySummary) =>
    render(
      <MemoryRouter>
        <DiaryEntryCard entry={entry} />
      </MemoryRouter>,
    );

  // ─── Manual entry rendering ─────────────────────────────────────────────────

  it('renders the entry title for manual entries', () => {
    renderCard(manualEntry);
    expect(screen.getByText('Daily Site Log')).toBeInTheDocument();
  });

  it('renders the body text for manual entries', () => {
    renderCard(manualEntry);
    expect(
      screen.getByText('Poured concrete foundations and inspected rebar placement.'),
    ).toBeInTheDocument();
  });

  it('renders the author display name', () => {
    renderCard(manualEntry);
    expect(screen.getByText(/Alice Builder/i)).toBeInTheDocument();
  });

  it('links to /diary/:id', () => {
    renderCard(manualEntry);
    const card = screen.getByTestId('diary-card-de-manual-1');
    expect(card).toHaveAttribute('href', '/diary/de-manual-1');
  });

  it('does not show the photo count indicator when photoCount is 0', () => {
    renderCard(manualEntry);
    expect(screen.queryByTestId('photo-count-de-manual-1')).not.toBeInTheDocument();
  });

  it('shows the photo count indicator with 📷 when photoCount > 0', () => {
    const entryWithPhotos: DiaryEntrySummary = { ...manualEntry, id: 'de-photos', photoCount: 3 };
    renderCard(entryWithPhotos);
    const indicator = screen.getByTestId('photo-count-de-photos');
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent).toContain('3');
    expect(indicator.textContent).toContain('📷');
  });

  it('does not show source link for manual entries without source entity', () => {
    renderCard(manualEntry);
    expect(screen.queryByTestId(/source-link/)).not.toBeInTheDocument();
  });

  // ─── Automatic entry rendering ──────────────────────────────────────────────

  it('applies the "automatic" CSS class to automatic entries', () => {
    renderCard(automaticEntry);
    const card = screen.getByTestId('diary-card-de-auto-1');
    expect(card.getAttribute('class') ?? '').toContain('automatic');
  });

  it('does not apply "automatic" CSS class to manual entries', () => {
    renderCard(manualEntry);
    const card = screen.getByTestId('diary-card-de-manual-1');
    expect(card.getAttribute('class') ?? '').not.toContain('automatic');
  });

  it('renders the body of an automatic entry', () => {
    renderCard(automaticEntry);
    expect(
      screen.getByText('Work item "Kitchen Installation" changed status to in_progress.'),
    ).toBeInTheDocument();
  });

  it('renders a source entity link for automatic entries with work_item source', () => {
    renderCard(automaticEntry);
    const sourceLink = screen.getByTestId('source-link-wi-kitchen-1');
    expect(sourceLink).toBeInTheDocument();
    expect(sourceLink).toHaveTextContent('Work Item');
  });

  it('source entity link for work_item points to /project/work-items/:sourceEntityId', () => {
    renderCard(automaticEntry);
    const sourceLink = screen.getByTestId('source-link-wi-kitchen-1');
    expect(sourceLink).toHaveAttribute('href', '/project/work-items/wi-kitchen-1');
  });

  it('renders invoice source link with correct route', () => {
    const invoiceEntry: DiaryEntrySummary = {
      ...automaticEntry,
      id: 'de-inv',
      entryType: 'invoice_status',
      sourceEntityType: 'invoice',
      sourceEntityId: 'inv-123',
    };
    renderCard(invoiceEntry);
    const sourceLink = screen.getByTestId('source-link-inv-123');
    expect(sourceLink).toHaveTextContent('Invoice');
    expect(sourceLink).toHaveAttribute('href', '/budget/invoices/inv-123');
  });

  it('renders milestone source link with correct route', () => {
    const milestoneEntry: DiaryEntrySummary = {
      ...automaticEntry,
      id: 'de-ms',
      entryType: 'milestone_delay',
      sourceEntityType: 'milestone',
      sourceEntityId: 'ms-456',
    };
    renderCard(milestoneEntry);
    const sourceLink = screen.getByTestId('source-link-ms-456');
    expect(sourceLink).toHaveTextContent('Milestone');
    expect(sourceLink).toHaveAttribute('href', '/project/milestones/ms-456');
  });

  // ─── Type badge ─────────────────────────────────────────────────────────────

  it('renders the type badge with correct testid', () => {
    renderCard(manualEntry);
    expect(screen.getByTestId('diary-type-badge-daily_log')).toBeInTheDocument();
  });

  it('renders ⚙️ badge for automatic entry types', () => {
    renderCard(automaticEntry);
    const badge = screen.getByTestId('diary-type-badge-work_item_status');
    expect(badge.textContent).toBe('⚙️');
  });

  // ─── No title for automatic entries ────────────────────────────────────────

  it('does not render a title element when title is null', () => {
    renderCard(automaticEntry);
    // The card link is present but no title div
    const card = screen.getByTestId('diary-card-de-auto-1');
    expect(card.querySelector('[class*="title"]')).toBeNull();
  });
});
