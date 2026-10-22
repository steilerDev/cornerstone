/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { HOME_SETUP_STEPS } from '@cornerstone/shared';
import type { HomeSetupResponse, HomeSetupStep } from '@cornerstone/shared';
import { TagCreateContext } from '../../objectForms/tagCreateContext.js';
import type { RequestTagCreate } from '../../objectForms/tagCreateContext.js';
import { renderHome } from '../../test/homeRender.js';
import { SetupChecklist } from './SetupChecklist.js';

function setupOf(
  done: Partial<Record<HomeSetupStep, boolean | null>> = {},
  steps: readonly HomeSetupStep[] = HOME_SETUP_STEPS,
): HomeSetupResponse {
  return {
    coreComplete: false,
    steps: steps.map((id) => ({ id, done: id in done ? (done[id] as boolean | null) : false })),
  };
}

function row(id: HomeSetupStep): HTMLElement {
  return screen.getByTestId(`home-setup-row-${id}`);
}

function step(id: HomeSetupStep): HTMLElement {
  return screen.getByTestId(`home-setup-step-${id}`);
}

function withTagCreate(request: RequestTagCreate | null) {
  return (children: ReactNode) => <TagCreateContext value={request}>{children}</TagCreateContext>;
}

let onRefetch: jest.Mock<() => void>;
let onSkip: jest.Mock<() => void>;

beforeEach(() => {
  onRefetch = jest.fn();
  onSkip = jest.fn();
});

function renderChecklist(setup: HomeSetupResponse, request: RequestTagCreate | null = null) {
  return renderHome(
    <main>
      <h1>Home</h1>
      <SetupChecklist setup={setup} onRefetch={onRefetch} onSkip={onSkip} />
    </main>,
    { wrap: withTagCreate(request) },
  );
}

describe('SetupChecklist', () => {
  it('lists all eight steps in order with a progress count', () => {
    renderChecklist(setupOf({ house: true, areas: true }));

    expect(screen.getByRole('heading', { name: /Set up your build/ })).toHaveTextContent(
      '(2 of 8 done)',
    );
    const labels = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(labels).toHaveLength(8);
    expect(labels[0]).toContain('Name your house');
    expect(labels[2]).toContain('Add your first funding source');
    expect(labels[7]).toContain('Log your first day on site');
  });

  it('lists only the steps it is given (six for a member) and counts against them', () => {
    renderChecklist(
      setupOf({ house: true }, ['house', 'areas', 'funding', 'companies', 'tasks', 'firstLog']),
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByTestId('home-setup-row-household')).toBeNull();
    expect(screen.queryByTestId('home-setup-row-backups')).toBeNull();
    expect(screen.getByRole('heading', { name: /Set up your build/ })).toHaveTextContent(
      '(1 of 6 done)',
    );
  });

  it('prefixes every step with done or to do for assistive technology', () => {
    renderChecklist(setupOf({ house: true, areas: false, funding: null }));

    expect(row('house')).toHaveTextContent('Done:');
    expect(row('areas')).toHaveTextContent('To do:');
    expect(row('funding')).toHaveTextContent('Not checked:');
    expect(row('funding')).not.toHaveTextContent('To do:');
  });

  it('a step that could not be checked is announced as not checked, never as to do', () => {
    renderChecklist(setupOf({ backups: null, house: true }));

    expect(row('backups')).toHaveTextContent('Not checked:');
    expect(row('backups')).not.toHaveTextContent('To do:');
    expect(row('backups')).not.toHaveTextContent('Done:');
    expect(row('house')).toHaveTextContent('Done:');
    expect(row('house')).not.toHaveTextContent('Not checked:');
  });

  it('shows a check for done steps only', () => {
    renderChecklist(setupOf({ house: true }));
    expect(row('house')).toHaveTextContent('✓');
    expect(row('areas')).not.toHaveTextContent('✓');
  });

  it('says a step could not be checked and retries on request', async () => {
    renderChecklist(setupOf({ backups: null }));

    expect(row('backups')).toHaveTextContent("Couldn't check");
    expect(row('house')).not.toHaveTextContent("Couldn't check");
    const retry = within(row('backups')).getByRole('button', { name: 'Try again' });
    expect(retry.className).toMatch(/btnText/);
    await userEvent.click(retry);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('links each step to where it is done', () => {
    renderChecklist(setupOf());

    expect(step('house')).toHaveAttribute('href', '/settings/manage#house');
    expect(step('funding').getAttribute('href')).toMatch(/^\/budget\/sources\?/);
    expect(step('companies').getAttribute('href')).toMatch(/^\/companies\/new/);
    expect(step('tasks').getAttribute('href')).toMatch(/^\/project\/work-items\/new/);
    expect(step('household')).toHaveAttribute('href', '/settings/users');
    expect(step('backups')).toHaveAttribute('href', '/settings/backups');
    expect(step('firstLog').getAttribute('href')).toMatch(/^\/diary\/new/);
  });

  it('links the areas step to the Areas page when no create dialog is available', () => {
    renderChecklist(setupOf(), null);
    expect(step('areas').tagName).toBe('A');
    expect(step('areas')).toHaveAttribute('href', '/areas');
  });

  it('opens the New area dialog in place and loads the checklist again after one is created', async () => {
    const request = jest.fn<RequestTagCreate>().mockResolvedValue({ id: 'a1', name: 'Area A' });
    renderChecklist(setupOf(), request);

    expect(step('areas').tagName).toBe('BUTTON');
    await userEvent.click(step('areas'));

    await waitFor(() => expect(onRefetch.mock.calls).toHaveLength(1));
    await waitFor(() => expect(onRefetch).toHaveBeenCalledTimes(1));
  });

  it('does not load again when the New area dialog was cancelled', async () => {
    const request = jest.fn<RequestTagCreate>().mockResolvedValue(null);
    renderChecklist(setupOf(), request);

    await userEvent.click(step('areas'));

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(onRefetch).not.toHaveBeenCalled();
  });

  it('skips setup and moves focus to the page heading', async () => {
    renderChecklist(setupOf());

    await userEvent.click(screen.getByRole('button', { name: 'Skip setup' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
    expect(screen.getByText('You can still add everything from the New menu.')).toBeInTheDocument();
  });
});
