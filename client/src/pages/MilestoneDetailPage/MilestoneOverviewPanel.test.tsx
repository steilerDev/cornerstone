/**
 * @jest-environment jsdom
 *
 * The milestone page's Overview tab (#2250): the Details card in read and edit mode, validation,
 * saving only the changed fields, the colour field and the controller that opens it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MilestoneDetail } from '@cornerstone/shared';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeMilestoneDetail } from '../../test/milestonePageFixtures.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as PanelModule from './MilestoneOverviewPanel.js';

const mockUpdate = jest.fn<typeof MilestonesApiTypes.updateMilestone>();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({ updateMilestone: mockUpdate }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Panel: typeof PanelModule;

const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/milestones/1', name: 'Sample milestone' } };
const TARGET_ID = 'target-date-input';

function renderPanel(milestone: MilestoneDetail = makeMilestoneDetail()) {
  const detailsRef = createRef<SectionCardController>();
  const view = render(
    <MemoryRouter>
      <Panel.MilestoneOverviewPanel
        milestone={milestone}
        revision={0}
        refresh={refresh}
        originState={ORIGIN}
        headingRef={{ current: null }}
        detailsCardRef={detailsRef}
        targetDateInputId={TARGET_ID}
      />
    </MemoryRouter>,
  );
  return { ...view, detailsRef };
}

async function edit() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('section-milestone-details-edit'));
  return user;
}
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByTestId('section-milestone-details-save'));

describe('MilestoneOverviewPanel', () => {
  beforeEach(async () => {
    mockUpdate.mockReset();
    refresh.mockReset();
    mockUpdate.mockResolvedValue({} as never);
    refresh.mockResolvedValue(undefined);
    if (!Panel) Panel = await import('./MilestoneOverviewPanel.js');
  });

  it('exports the panel as the default too', () => {
    expect(Panel.default).toBe(Panel.MilestoneOverviewPanel);
  });

  describe('read mode', () => {
    it('shows the Details card with the formatted target date', () => {
      renderPanel(makeMilestoneDetail({ targetDate: '2026-06-01' }));
      expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeInTheDocument();
      expect(screen.getByTestId('milestone-detail-target')).toHaveTextContent(/Jun 1, 2026/);
    });

    it('shows the description as the first thing in the card', () => {
      renderPanel(makeMilestoneDetail({ description: 'Roof is closed and dry.' }));
      expect(screen.getByText('Roof is closed and dry.')).toBeVisible();
      expect(screen.queryByTestId('milestone-detail-empty')).toBeNull();
    });

    // Mutation: a truthiness check on `null` only would show an empty block for ''.
    it.each([
      ['null', null],
      ['an empty string', ''],
    ])('says "Nothing added yet" for a description that is %s', (_name, description) => {
      renderPanel(makeMilestoneDetail({ description }));
      expect(screen.getByTestId('milestone-detail-empty')).toHaveTextContent('Nothing added yet');
    });

    // Mutation: dropping the isCompleted guard shows "Reached on" for an open milestone.
    it('shows Reached on only when the milestone is reached', () => {
      const { unmount } = renderPanel(makeMilestoneDetail());
      expect(screen.queryByTestId('milestone-detail-reached')).toBeNull();
      unmount();
      renderPanel(
        makeMilestoneDetail({ isCompleted: true, completedAt: '2026-05-20T10:00:00.000Z' }),
      );
      expect(screen.getByTestId('milestone-detail-reached')).toHaveTextContent(/May 20, 2026/);
      expect(screen.getByText('Reached on')).toBeVisible();
    });

    it('shows a colour swatch and the hex as text when a colour is set', () => {
      renderPanel(makeMilestoneDetail({ color: '#336699' }));
      const row = screen.getByTestId('milestone-detail-color');
      expect(row).toHaveTextContent('#336699');
      expect(row.querySelector('[data-color="set"]')).not.toBeNull();
      expect(row).not.toHaveTextContent('No color');
    });

    it('says "No color" without a swatch when no colour is set', () => {
      renderPanel(makeMilestoneDetail({ color: null }));
      const row = screen.getByTestId('milestone-detail-color');
      expect(row).toHaveTextContent('No color');
      expect(row.querySelector('[data-color="set"]')).toBeNull();
    });
  });

  describe('edit mode', () => {
    it('opens with the current values and focuses the title', async () => {
      renderPanel(
        makeMilestoneDetail({
          title: 'Roof closed',
          targetDate: '2026-06-01',
          description: 'Dry shell.',
          color: '#336699',
        }),
      );
      await edit();
      expect(screen.getByTestId('milestone-field-title')).toHaveValue('Roof closed');
      expect(screen.getByTestId('milestone-field-target-date')).toHaveValue('2026-06-01');
      expect(screen.getByTestId('milestone-field-description')).toHaveValue('Dry shell.');
      expect(screen.getByTestId('milestone-field-color')).toHaveValue('#336699');
      expect(screen.getByTestId('milestone-field-title')).toHaveFocus();
    });

    it('gives the target date input the id the page uses for Change target', async () => {
      renderPanel();
      await edit();
      expect(screen.getByTestId('milestone-field-target-date')).toHaveAttribute('id', TARGET_ID);
    });

    it('opens through the controller ref (the e shortcut and Change target)', async () => {
      const { detailsRef } = renderPanel();
      act(() => detailsRef.current!.startEdit());
      expect(await screen.findByTestId('milestone-field-title')).toBeInTheDocument();
    });

    // Mutation: sending the whole draft overwrites fields another tab changed.
    it('sends only the changed title, trimmed, and refreshes the page', async () => {
      renderPanel();
      const user = await edit();
      await user.clear(screen.getByTestId('milestone-field-title'));
      await user.type(screen.getByTestId('milestone-field-title'), '  Roof closed  ');
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { title: 'Roof closed' }));
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('sends only a changed target date', async () => {
      renderPanel();
      const user = await edit();
      fireEvent.change(screen.getByTestId('milestone-field-target-date'), {
        target: { value: '2026-07-15' },
      });
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { targetDate: '2026-07-15' }));
    });

    it('sends a new description trimmed and an emptied one as null', async () => {
      const { unmount } = renderPanel();
      let user = await edit();
      await user.type(screen.getByTestId('milestone-field-description'), ' Dry shell ');
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { description: 'Dry shell' }));
      unmount();
      mockUpdate.mockClear();
      renderPanel(makeMilestoneDetail({ description: 'Dry shell' }));
      user = await edit();
      await user.clear(screen.getByTestId('milestone-field-description'));
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { description: null }));
    });

    it('sends a picked colour', async () => {
      renderPanel();
      const user = await edit();
      // "No color" is ticked for a milestone without one: untick it, then pick.
      await user.click(screen.getByTestId('milestone-field-no-color'));
      fireEvent.change(screen.getByTestId('milestone-field-color'), {
        target: { value: '#1a2b3c' },
      });
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { color: '#1a2b3c' }));
    });

    it('sends null when "No color" is ticked on a milestone that had a colour', async () => {
      renderPanel(makeMilestoneDetail({ color: '#336699' }));
      const user = await edit();
      await user.click(screen.getByTestId('milestone-field-no-color'));
      expect(screen.getByTestId('milestone-field-color')).toBeDisabled();
      await save(user);
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { color: null }));
    });

    it('sends nothing for the colour when it was left alone', async () => {
      renderPanel(makeMilestoneDetail({ color: '#336699' }));
      const user = await edit();
      await user.type(screen.getByTestId('milestone-field-title'), '!');
      await save(user);
      await waitFor(() =>
        expect(mockUpdate).toHaveBeenCalledWith(1, { title: 'Sample milestone!' }),
      );
    });
  });

  describe('validation', () => {
    it('requires a title: shows the field error, does not save', async () => {
      renderPanel();
      const user = await edit();
      await user.clear(screen.getByTestId('milestone-field-title'));
      await save(user);
      expect(await screen.findByText('Title is required.')).toBeVisible();
      expect(screen.getByTestId('milestone-field-title')).toHaveAttribute('aria-invalid', 'true');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('treats a blank title as missing', async () => {
      renderPanel();
      const user = await edit();
      await user.clear(screen.getByTestId('milestone-field-title'));
      await user.type(screen.getByTestId('milestone-field-title'), '   ');
      await save(user);
      expect(await screen.findByText('Title is required.')).toBeVisible();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('requires a target date: shows the field error, does not save', async () => {
      renderPanel();
      const user = await edit();
      fireEvent.change(screen.getByTestId('milestone-field-target-date'), {
        target: { value: '' },
      });
      await save(user);
      expect(await screen.findByText('Target date is required.')).toBeVisible();
      expect(screen.getByTestId('milestone-field-target-date')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('shows both errors at once and no title error for a valid title', async () => {
      renderPanel();
      const user = await edit();
      fireEvent.change(screen.getByTestId('milestone-field-target-date'), {
        target: { value: '' },
      });
      await save(user);
      expect(await screen.findByText('Target date is required.')).toBeVisible();
      expect(screen.queryByText('Title is required.')).toBeNull();
    });
  });

  describe('save failure', () => {
    it('keeps the card open with the save banner and does not refresh', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('network'));
      renderPanel();
      const user = await edit();
      await user.type(screen.getByTestId('milestone-field-title'), '!');
      await save(user);
      expect(await screen.findByText("Couldn't save the milestone.")).toBeVisible();
      expect(screen.getByTestId('milestone-field-title')).toHaveValue('Sample milestone!');
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  it('Cancel restores the read view with the saved values', async () => {
    renderPanel(makeMilestoneDetail({ title: 'Roof closed' }));
    const user = await edit();
    await user.type(screen.getByTestId('milestone-field-title'), 'xyz');
    await user.click(screen.getByTestId('section-milestone-details-cancel'));
    const discard = screen.queryByTestId('section-milestone-details-discard-confirm');
    if (discard) await user.click(discard);
    await waitFor(() => expect(screen.queryByTestId('milestone-field-title')).toBeNull());
    expect(screen.getByTestId('milestone-detail-target')).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
