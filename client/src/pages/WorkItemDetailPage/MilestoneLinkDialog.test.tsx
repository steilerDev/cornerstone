/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import type * as DialogModule from './MilestoneLinkDialog.js';

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));
jest.unstable_mockModule('../../lib/workItemMilestonesApi.js', () => ({
  addRequiredMilestone: jest.fn(),
  addLinkedMilestone: jest.fn(),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Dialog: typeof DialogModule;
const onClose = jest.fn<() => void>();

describe('MilestoneLinkDialog', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    onClose.mockReset();
    if (!Dialog) Dialog = await import('./MilestoneLinkDialog.js');
  });

  it('opens the Link milestone form under the milestone-link-form test id', () => {
    render(
      <MemoryRouter>
        <Dialog.MilestoneLinkDialog
          workItemId="wi-1"
          requiredIds={[]}
          linkedIds={[]}
          onSaved={async () => undefined}
          onClose={onClose}
          openerRef={{ current: null }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('milestone-link-form')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Link milestone' })).toBeInTheDocument();
  });

  it('Cancel asks the host to close', async () => {
    render(
      <MemoryRouter>
        <Dialog.MilestoneLinkDialog
          workItemId="wi-1"
          requiredIds={[]}
          linkedIds={[]}
          onSaved={async () => undefined}
          onClose={onClose}
          openerRef={{ current: null }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('milestone-link-form-cancel'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
