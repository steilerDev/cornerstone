/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { UseAttentionResult } from '../../hooks/useAttention.js';
import type * as AttentionApiTypes from '../../lib/attentionApi.js';
import type * as SectionModule from './TidyUpSection.js';
import { renderHome } from '../../test/homeRender.js';
import { makeAttention, makeRow } from '../../test/attentionFixtures.js';

jest.unstable_mockModule('../../lib/attentionApi.js', () => ({
  getAttention: jest.fn<typeof AttentionApiTypes.getAttention>(),
  notNow: jest.fn<typeof AttentionApiTypes.notNow>(),
  undoNotNow: jest.fn<typeof AttentionApiTypes.undoNotNow>(),
}));

let TidyUpSection: typeof SectionModule.TidyUpSection;

function attentionOf(data: UseAttentionResult['data']): UseAttentionResult {
  return {
    data,
    status: data ? 'ready' : 'loading',
    error: null,
    includeSnoozed: false,
    setIncludeSnoozed: jest.fn(),
    refresh: jest.fn(),
    retry: jest.fn(),
    removeRow: jest.fn(),
  };
}

beforeEach(async () => {
  if (!TidyUpSection) ({ TidyUpSection } = await import('./TidyUpSection.js'));
});

function renderTidy(
  attention: UseAttentionResult,
  { open = true, onToggle = jest.fn() }: { open?: boolean; onToggle?: () => void } = {},
) {
  return renderHome(
    <TidyUpSection
      attention={attention}
      open={open}
      onToggle={onToggle}
      fallbackFocusRef={createRef<HTMLElement>()}
    />,
  );
}

describe('TidyUpSection', () => {
  it('renders nothing before the data arrives', () => {
    renderTidy(attentionOf(null));
    expect(screen.queryByTestId('home-tidy-up')).toBeNull();
  });

  it('renders nothing without chores', () => {
    renderTidy(attentionOf(makeAttention([makeRow('N1')], [])));
    expect(screen.queryByTestId('home-tidy-up')).toBeNull();
  });

  it('lists the chores with a count in the heading and no tier badge count elsewhere', () => {
    renderTidy(attentionOf(makeAttention([], [makeRow('H1'), makeRow('H2'), makeRow('H4')])));

    const section = screen.getByTestId('home-tidy-up');
    expect(within(section).getByRole('button', { name: /Tidy up/ })).toHaveTextContent('(3)');
    expect(section.querySelectorAll('li[data-testid^="tidy-up-row-"]')).toHaveLength(3);
  });

  it('collapses through its heading button and hides the body when closed', async () => {
    const onToggle = jest.fn();
    renderTidy(attentionOf(makeAttention([], [makeRow('H4')])), { open: false, onToggle });

    const toggle = screen.getByRole('button', { name: /Tidy up/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('tidy-up-row-H4:work_item:wi-3')).not.toBeVisible();

    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the body when open', () => {
    renderTidy(attentionOf(makeAttention([], [makeRow('H4')])), { open: true });
    expect(screen.getByRole('button', { name: /Tidy up/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('tidy-up-row-H4:work_item:wi-3')).toBeVisible();
  });
});
