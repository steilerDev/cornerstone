/**
 * @jest-environment jsdom
 *
 * Unit tests for DiaryMetadataSummary component.
 *
 * Story #1672: Daily-log vendor + work start/end time + computed duration.
 * Covers all the new daily_log metadata fields as well as the pre-existing
 * weather/temperature/workers behaviour and the site_visit render path.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import type { DiaryEntryType } from '@cornerstone/shared';

// DiaryMetadataSummaryProps is not exported; reconstruct it from the component signature.
interface DiaryMetadataSummaryProps {
  entryType: DiaryEntryType;
  metadata: unknown;
}

// DiaryMetadataSummary has no API deps — import it after declaring module scope
let DiaryMetadataSummary: React.ComponentType<DiaryMetadataSummaryProps>;

describe('DiaryMetadataSummary', () => {
  beforeEach(async () => {
    if (!DiaryMetadataSummary) {
      const mod = await import('./DiaryMetadataSummary.js');
      DiaryMetadataSummary = mod.DiaryMetadataSummary;
    }
  });

  // ─── daily_log: new vendorName field (Story #1672) ─────────────────────────

  describe('daily_log vendorName', () => {
    it('renders vendor name when vendorName is present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ vendorName: 'ACME Contractors' }}
        />,
      );
      expect(screen.getByText(/ACME Contractors/)).toBeInTheDocument();
    });

    it('does not render vendor span when vendorName is absent', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ weather: 'sunny' }}
        />,
      );
      // Only vendor-related i18n prefix would identify the span
      expect(screen.queryByText(/ACME/)).not.toBeInTheDocument();
    });

    it('does not render vendor span when vendorName is null', () => {
      const { container } = render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ vendorName: null }}
        />,
      );
      // Component should render without crash; no vendor text present
      expect(container.querySelector('[data-testid="daily-log-metadata"]')).toBeInTheDocument();
      expect(screen.queryByText(/null/)).not.toBeInTheDocument();
    });
  });

  // ─── daily_log: new workStart / workEnd fields (Story #1672) ─────────────

  describe('daily_log workStart / workEnd', () => {
    it('renders workStart when present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workStart: '08:00' }}
        />,
      );
      expect(screen.getByText(/08:00/)).toBeInTheDocument();
    });

    it('renders workEnd when present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workEnd: '16:30' }}
        />,
      );
      expect(screen.getByText(/16:30/)).toBeInTheDocument();
    });
  });

  // ─── daily_log: computed duration (Story #1672) ───────────────────────────

  describe('daily_log computed duration', () => {
    it('renders computed duration "8.50 h" when both valid times are present and end>start', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workStart: '08:00', workEnd: '16:30' }}
        />,
      );
      expect(screen.getByText(/8\.50 h/)).toBeInTheDocument();
    });

    it('does not render duration span when only workStart is present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workStart: '08:00' }}
        />,
      );
      expect(screen.queryByText(/\.00 h|\.50 h/)).not.toBeInTheDocument();
    });

    it('does not render duration when workEnd equals workStart', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workStart: '08:00', workEnd: '08:00' }}
        />,
      );
      expect(screen.queryByText(/0\.00 h/)).not.toBeInTheDocument();
    });

    it('does not render duration when workEnd is before workStart', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workStart: '16:00', workEnd: '08:00' }}
        />,
      );
      expect(screen.queryByText(/ h/)).not.toBeInTheDocument();
    });
  });

  // ─── daily_log: pre-existing fields still render (regression guard) ────────

  describe('daily_log pre-existing fields', () => {
    it('renders weather emoji + label when weather is present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ weather: 'sunny' }}
        />,
      );
      expect(screen.getByText(/sunny/)).toBeInTheDocument();
    });

    it('renders temperature when temperatureCelsius is present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ temperatureCelsius: 22 }}
        />,
      );
      expect(screen.getByText(/22/)).toBeInTheDocument();
    });

    it('renders workers count when workersOnSite is present', () => {
      render(
        <DiaryMetadataSummary
          entryType="daily_log"
          metadata={{ workersOnSite: 5 }}
        />,
      );
      expect(screen.getByText(/5/)).toBeInTheDocument();
    });
  });

  // ─── site_visit renders without error ─────────────────────────────────────

  describe('site_visit', () => {
    it('renders without error for site_visit entryType', () => {
      expect(() =>
        render(
          <DiaryMetadataSummary
            entryType="site_visit"
            metadata={{ inspectorName: 'Jane Doe', outcome: 'pass' }}
          />,
        ),
      ).not.toThrow();
      const container = document.querySelector('[data-testid="site-visit-metadata"]');
      expect(container).toBeInTheDocument();
    });

    it('site_visit does not render daily-log-metadata testid', () => {
      render(
        <DiaryMetadataSummary
          entryType="site_visit"
          metadata={{ inspectorName: 'Bob' }}
        />,
      );
      expect(document.querySelector('[data-testid="daily-log-metadata"]')).not.toBeInTheDocument();
    });
  });

  // ─── delivery branch ──────────────────────────────────────────────────────

  describe('delivery', () => {
    it('renders delivery-metadata testid for delivery entryType', () => {
      render(
        <DiaryMetadataSummary
          entryType="delivery"
          metadata={{ vendor: 'Build-It Corp', materials: ['Bricks', 'Cement'] }}
        />,
      );
      expect(document.querySelector('[data-testid="delivery-metadata"]')).toBeInTheDocument();
      expect(screen.getByText('Build-It Corp')).toBeInTheDocument();
      expect(screen.getByText('Bricks')).toBeInTheDocument();
    });
  });

  // ─── issue branch ─────────────────────────────────────────────────────────

  describe('issue', () => {
    it('renders issue-metadata testid for issue entryType', () => {
      render(
        <DiaryMetadataSummary
          entryType="issue"
          metadata={{ severity: 'high', resolutionStatus: 'open' }}
        />,
      );
      expect(document.querySelector('[data-testid="issue-metadata"]')).toBeInTheDocument();
    });
  });

  // ─── automatic entry types (auto-event branch) ───────────────────────────

  describe('automatic entry types', () => {
    it('renders auto-event-summary testid for work_item_status', () => {
      render(
        <DiaryMetadataSummary
          entryType="work_item_status"
          metadata={{ changeSummary: 'Status changed to completed', newValue: 'completed' }}
        />,
      );
      expect(document.querySelector('[data-testid="auto-event-summary"]')).toBeInTheDocument();
      expect(screen.getByText('Status changed to completed')).toBeInTheDocument();
    });

    it('renders StatusPill with newValue for invoice_status', () => {
      render(
        <DiaryMetadataSummary
          entryType="invoice_status"
          metadata={{ newValue: 'paid' }}
        />,
      );
      expect(screen.getByText('paid')).toBeInTheDocument();
    });

    it('renders auto-event-summary for budget_breach', () => {
      render(
        <DiaryMetadataSummary
          entryType="budget_breach"
          metadata={{ changeSummary: 'Budget exceeded' }}
        />,
      );
      expect(document.querySelector('[data-testid="auto-event-summary"]')).toBeInTheDocument();
    });

    it('StatusPill renders "failed" newValue (danger color branch)', () => {
      render(
        <DiaryMetadataSummary
          entryType="work_item_status"
          metadata={{ newValue: 'failed' }}
        />,
      );
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('StatusPill renders "in_progress" newValue (in-progress color branch)', () => {
      render(
        <DiaryMetadataSummary
          entryType="work_item_status"
          metadata={{ newValue: 'in_progress' }}
        />,
      );
      expect(screen.getByText('in_progress')).toBeInTheDocument();
    });

    it('StatusPill renders "completed" newValue (success color branch)', () => {
      render(
        <DiaryMetadataSummary
          entryType="work_item_status"
          metadata={{ newValue: 'completed' }}
        />,
      );
      expect(screen.getByText('completed')).toBeInTheDocument();
    });
  });

  // ─── null / missing metadata ───────────────────────────────────────────────

  describe('null metadata', () => {
    it('renders null (no output) for daily_log when metadata is null', () => {
      const { container } = render(
        <DiaryMetadataSummary entryType="daily_log" metadata={null} />,
      );
      // When metadata is null, the component renders null — container is empty
      expect(container.firstChild).toBeNull();
    });
  });
});
