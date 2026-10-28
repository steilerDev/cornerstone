/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeTaskRow } from '../../test/taskListFixtures.js';
import type * as CommandModule from './TaskRowCommand.js';
import type { TaskActions } from './useTaskActions.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let TaskRowCommand: typeof CommandModule.TaskRowCommand;
const applyStatus = jest.fn<TaskActions['applyStatus']>();

function mount(status: 'not_started' | 'in_progress' | 'completed') {
  const item = makeTaskRow({ id: 'wi-1', title: 'Tile the hallway', status });
  render(
    <MemoryRouter>
      <TaskRowCommand item={item} actions={{ applyStatus }} testId="cmd" />
    </MemoryRouter>,
  );
  return item;
}

beforeEach(async () => {
  if (!TaskRowCommand) ({ TaskRowCommand } = await import('./TaskRowCommand.js'));
  applyStatus.mockReset();
  applyStatus.mockResolvedValue();
});

describe('TaskRowCommand', () => {
  it('names the command "Start, Tile the hallway"', () => {
    mount('not_started');
    expect(screen.getByTestId('cmd')).toHaveAccessibleName('Start, Tile the hallway');
  });

  it('Start asks when it started, then applies In progress with the chosen date', async () => {
    const item = mount('not_started');
    await userEvent.click(screen.getByTestId('cmd'));
    expect((await screen.findAllByText('When did it start?')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByTestId('cmd-date-today'));
    expect(applyStatus).toHaveBeenCalledTimes(1);
    expect(applyStatus.mock.calls[0]![0]).toBe(item);
    expect(applyStatus.mock.calls[0]![1]).toBe('in_progress');
    expect(applyStatus.mock.calls[0]![2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shows Mark done for a task in progress and asks when it was finished', async () => {
    const item = mount('in_progress');
    expect(screen.getByTestId('cmd')).toHaveAccessibleName('Mark done, Tile the hallway');
    await userEvent.click(screen.getByTestId('cmd'));
    expect((await screen.findAllByText('When was it finished?')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByTestId('cmd-date-today'));
    expect(applyStatus.mock.calls[0]![0]).toBe(item);
    expect(applyStatus.mock.calls[0]![1]).toBe('completed');
  });

  it('renders nothing for a done task', () => {
    mount('completed');
    expect(screen.queryByTestId('cmd')).toBeNull();
  });
});
