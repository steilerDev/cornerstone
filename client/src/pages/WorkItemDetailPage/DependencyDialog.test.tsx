/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import type * as DependenciesApiTypes from '../../lib/dependenciesApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as DialogModule from './DependencyDialog.js';

const mockUpdateDependency = jest.fn<typeof DependenciesApiTypes.updateDependency>();
jest.unstable_mockModule('../../lib/dependenciesApi.js', () => ({
  createDependency: jest.fn(),
  updateDependency: mockUpdateDependency,
}));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: jest.fn<typeof WorkItemsApiTypes.listWorkItems>().mockResolvedValue({
    items: [],
  } as never),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Dialog: typeof DialogModule;
const onSaved = jest.fn<() => Promise<unknown>>();
const onClose = jest.fn<() => void>();

function renderDialog(target: DialogModule.DependencyDialogTarget) {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  const openerRef = createRef<HTMLElement>() as { current: HTMLElement | null };
  openerRef.current = opener;
  render(
    <MemoryRouter>
      <Dialog.DependencyDialog
        workItemId="wi-1"
        target={target}
        excludeIds={['wi-1']}
        onSaved={onSaved}
        onClose={onClose}
        openerRef={openerRef}
      />
    </MemoryRouter>,
  );
  return opener;
}

describe('DependencyDialog', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    mockUpdateDependency.mockReset();
    mockUpdateDependency.mockResolvedValue({} as never);
    onSaved.mockReset();
    onSaved.mockResolvedValue(undefined);
    onClose.mockReset();
    if (!Dialog) Dialog = await import('./DependencyDialog.js');
  });

  it('opens the Add form for the direction under the dependency-form test id', () => {
    renderDialog({ mode: 'add', direction: 'waiting' });
    expect(screen.getByTestId('dependency-form')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Add a task that waits for this one' }),
    ).toBeInTheDocument();
  });

  it('Cancel asks the host to close the dialog (focus return is covered with the lists)', async () => {
    renderDialog({ mode: 'add', direction: 'waitsFor' });
    fireEvent.click(screen.getByTestId('dependency-form-cancel'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('Save on an Edit sends the change, refreshes, then closes', async () => {
    renderDialog({
      mode: 'edit',
      direction: 'waitsFor',
      row: { id: 'p-1', title: 'Dig trench', dependencyType: 'finish_to_start', leadLagDays: 0 },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('dependency-form-save'));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockUpdateDependency).toHaveBeenCalledWith('wi-1', 'p-1', {
      dependencyType: 'finish_to_start',
      leadLagDays: 0,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
