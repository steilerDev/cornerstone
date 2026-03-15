/**
 * @jest-environment jsdom
 *
 * Unit tests for RecentDiaryCard component.
 *
 * EPIC-13: Construction Diary — UAT Fixes
 * Tests loading, error, empty, and populated states, plus navigation links.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { RecentDiaryCard } from './RecentDiaryCard.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(id: string, overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    title: `Entry ${id}`,
    body: `Body text for entry ${id}`,
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'Alice' },
    createdAt: '2026-03-14T09:00:00.000Z',
    updatedAt: '2026-03-14T09:00:00.000Z',
    ...overrides,
  };
}

describe('RecentDiaryCard', () => {
  beforeEach(() => {
    localStorage.setItem('theme', 'light');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderCard = (
    props: { entries: DiaryEntrySummary[]; isLoading: boolean; error: string | null },
  ) =>
    render(
      <MemoryRouter>
        <RecentDiaryCard {...props} />
      </MemoryRouter>,
    );

  // ─── Loading state ─────────────────────────────────────────────────────────

  it('shows loading indicator when isLoading=true', () => {
    renderCard({ entries: [], isLoading: true, error: null });
    expect(screen.getByText(/loading entries/i)).toBeInTheDocument();
  });

  it('does not show entry list when isLoading=true', () => {
    renderCard({ entries: [makeEntry('de-1')], isLoading: true, error: null });
    expect(screen.queryByTestId('recent-diary-de-1')).not.toBeInTheDocument();
  });

  // ─── Error state ───────────────────────────────────────────────────────────

  it('shows the error message when error is set', () => {
    renderCard({ entries: [], isLoading: false, error: 'Failed to load diary entries' });
    expect(screen.getByText('Failed to load diary entries')).toBeInTheDocument();
  });

  it('does not show entry list when error is set', () => {
    renderCard({
      entries: [makeEntry('de-1')],
      isLoading: false,
      error: 'Something went wrong',
    });
    expect(screen.queryByTestId('recent-diary-de-1')).not.toBeInTheDocument();
  });

  // ─── Empty state ───────────────────────────────────────────────────────────

  it('shows "No diary entries yet" when entries is empty', () => {
    renderCard({ entries: [], isLoading: false, error: null });
    expect(screen.getByText(/no diary entries yet/i)).toBeInTheDocument();
  });

  it('shows a link to /diary/new in the empty state', () => {
    renderCard({ entries: [], isLoading: false, error: null });
    const link = screen.getByRole('link', { name: /create first entry/i });
    expect(link).toHaveAttribute('href', '/diary/new');
  });

  it('does not show the entries list or footer links in the empty state', () => {
    renderCard({ entries: [], isLoading: false, error: null });
    expect(screen.queryByRole('link', { name: /view all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new entry/i })).not.toBeInTheDocument();
  });

  // ─── Populated state ───────────────────────────────────────────────────────

  it('renders entry items with data-testid for each entry', () => {
    const entries = [makeEntry('de-1'), makeEntry('de-2')];
    renderCard({ entries, isLoading: false, error: null });
    expect(screen.getByTestId('recent-diary-de-1')).toBeInTheDocument();
    expect(screen.getByTestId('recent-diary-de-2')).toBeInTheDocument();
  });

  it('each entry item links to /diary/:id', () => {
    const entries = [makeEntry('de-42')];
    renderCard({ entries, isLoading: false, error: null });
    const link = screen.getByTestId('recent-diary-de-42');
    expect(link).toHaveAttribute('href', '/diary/de-42');
  });

  it('renders entry title text', () => {
    renderCard({ entries: [makeEntry('de-1', { title: 'Concrete Pour Day' })], isLoading: false, error: null });
    expect(screen.getByText('Concrete Pour Day')).toBeInTheDocument();
  });

  it('renders "Untitled" when entry title is null', () => {
    renderCard({ entries: [makeEntry('de-1', { title: null })], isLoading: false, error: null });
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('renders a preview of entry body text (up to 100 chars)', () => {
    const longBody = 'A'.repeat(120);
    renderCard({ entries: [makeEntry('de-1', { body: longBody })], isLoading: false, error: null });
    // Preview should be 100 chars
    expect(screen.getByText('A'.repeat(100))).toBeInTheDocument();
  });

  // ─── Footer links ──────────────────────────────────────────────────────────

  it('"View All" link points to /diary', () => {
    renderCard({ entries: [makeEntry('de-1')], isLoading: false, error: null });
    const viewAll = screen.getByRole('link', { name: /view all/i });
    expect(viewAll).toHaveAttribute('href', '/diary');
  });

  it('"+ New Entry" link points to /diary/new', () => {
    renderCard({ entries: [makeEntry('de-1')], isLoading: false, error: null });
    const newEntry = screen.getByRole('link', { name: /new entry/i });
    expect(newEntry).toHaveAttribute('href', '/diary/new');
  });

  it('renders both footer links when entries exist', () => {
    renderCard({ entries: [makeEntry('de-1')], isLoading: false, error: null });
    expect(screen.getByRole('link', { name: /view all/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new entry/i })).toBeInTheDocument();
  });

  // ─── Multiple entries rendered ─────────────────────────────────────────────

  it('renders all entries when multiple are provided', () => {
    const entries = [makeEntry('de-1'), makeEntry('de-2'), makeEntry('de-3')];
    renderCard({ entries, isLoading: false, error: null });
    expect(screen.getByTestId('recent-diary-de-1')).toBeInTheDocument();
    expect(screen.getByTestId('recent-diary-de-2')).toBeInTheDocument();
    expect(screen.getByTestId('recent-diary-de-3')).toBeInTheDocument();
  });
});
