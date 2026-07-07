/**
 * @jest-environment jsdom
 *
 * SubsidyLinkSection — unit tests
 *
 * Strategy: no module mocking of the component tree. The real LocaleProvider
 * (for useFormatters()/useLocale()) and real i18next instance (booted by
 * client/src/test/setupTests.ts) are used, so assertions check real rendered
 * English text rather than raw translation keys. configApi.js/preferencesApi.js
 * are mocked so LocaleProvider's config fetch doesn't hit the real network
 * (same pattern as EditBudgetLineModal.test.tsx).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { SubsidyProgram } from '@cornerstone/shared';
import type * as SubsidyLinkSectionModule from './SubsidyLinkSection.js';
import type * as LocaleContextModule from '../../contexts/LocaleContext.js';

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest.fn(() =>
    Promise.resolve({ currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: false }),
  ),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(() => Promise.resolve([])),
  upsertPreference: jest.fn(() => Promise.resolve()),
}));

let SubsidyLinkSection: (typeof SubsidyLinkSectionModule)['SubsidyLinkSection'];
let LocaleProvider: (typeof LocaleContextModule)['LocaleProvider'];

// `render` wraps in the real LocaleProvider so useFormatters()/useLocale()
// calls inside SubsidyLinkSection resolve without throwing.
function render(ui: React.ReactElement) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>);
}

function makeSubsidy(overrides?: Partial<SubsidyProgram>): SubsidyProgram {
  return {
    id: 'sub-1',
    name: 'Energy Efficiency Rebate',
    description: null,
    eligibility: null,
    reductionType: 'percentage',
    reductionValue: 15,
    applicationStatus: 'approved',
    applicationDeadline: null,
    notes: null,
    maximumAmount: null,
    applicableCategories: [],
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('SubsidyLinkSection', () => {
  let onSelectSubsidy: jest.Mock;
  let onLinkSubsidy: jest.Mock;
  let onUnlinkSubsidy: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    const [mod, localeMod] = await Promise.all([
      import('./SubsidyLinkSection.js'),
      import('../../contexts/LocaleContext.js'),
    ]);
    SubsidyLinkSection = mod.SubsidyLinkSection;
    LocaleProvider = localeMod.LocaleProvider;

    onSelectSubsidy = jest.fn();
    onLinkSubsidy = jest.fn();
    onUnlinkSubsidy = jest.fn();
  });

  function buildProps(
    overrides?: Partial<React.ComponentProps<typeof SubsidyLinkSection>>,
  ): React.ComponentProps<typeof SubsidyLinkSection> {
    return {
      linkedSubsidies: [],
      availableSubsidies: [],
      selectedSubsidyId: '',
      onSelectSubsidy,
      onLinkSubsidy,
      onUnlinkSubsidy,
      isLinking: false,
      ...overrides,
    };
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  it('renders the empty state message when no subsidies are linked', () => {
    render(<SubsidyLinkSection {...buildProps()} />);

    expect(screen.getByText('No subsidies linked')).toBeInTheDocument();
  });

  it('does not render the empty state when at least one subsidy is linked', () => {
    render(<SubsidyLinkSection {...buildProps({ linkedSubsidies: [makeSubsidy()] })} />);

    expect(screen.queryByText('No subsidies linked')).not.toBeInTheDocument();
  });

  // ─── Linked subsidies: percentage / fixed reduction rendering ─────────────

  it('renders a linked subsidy with a percentage reduction', () => {
    const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 15 });
    render(<SubsidyLinkSection {...buildProps({ linkedSubsidies: [subsidy] })} />);

    expect(screen.getByText(subsidy.name)).toBeInTheDocument();
    expect(screen.getByText('15% reduction')).toBeInTheDocument();
  });

  it('renders a linked subsidy with a fixed-amount reduction formatted as currency', () => {
    const subsidy = makeSubsidy({
      id: 'sub-2',
      name: 'Fixed Rebate',
      reductionType: 'fixed',
      reductionValue: 5000,
    });
    render(<SubsidyLinkSection {...buildProps({ linkedSubsidies: [subsidy] })} />);

    // Default locale/currency in tests is en-US/EUR (LocaleProvider defaults).
    expect(screen.getByText(/reduction$/)).toHaveTextContent('€5,000.00 reduction');
  });

  // ─── Oversubscribed badge ───────────────────────────────────────────────────

  it('renders the oversubscribed badge when the subsidy id is in oversubscribedIds', () => {
    const subsidy = makeSubsidy();
    render(
      <SubsidyLinkSection
        {...buildProps({
          linkedSubsidies: [subsidy],
          oversubscribedIds: new Set([subsidy.id]),
        })}
      />,
    );

    expect(screen.getByText('Oversubscribed')).toBeInTheDocument();
  });

  it('does not render the oversubscribed badge when the subsidy id is not in oversubscribedIds', () => {
    const subsidy = makeSubsidy();
    render(
      <SubsidyLinkSection
        {...buildProps({
          linkedSubsidies: [subsidy],
          oversubscribedIds: new Set(['some-other-id']),
        })}
      />,
    );

    expect(screen.queryByText('Oversubscribed')).not.toBeInTheDocument();
  });

  it('does not render the oversubscribed badge when oversubscribedIds is undefined', () => {
    const subsidy = makeSubsidy();
    render(<SubsidyLinkSection {...buildProps({ linkedSubsidies: [subsidy] })} />);

    expect(screen.queryByText('Oversubscribed')).not.toBeInTheDocument();
  });

  // ─── Unlink button ──────────────────────────────────────────────────────────

  it('renders the unlink button with the correct interpolated aria-label', () => {
    const subsidy = makeSubsidy({ name: 'Solar Panel Grant' });
    render(<SubsidyLinkSection {...buildProps({ linkedSubsidies: [subsidy] })} />);

    expect(
      screen.getByRole('button', { name: 'Unlink subsidy Solar Panel Grant' }),
    ).toBeInTheDocument();
  });

  it('fires onUnlinkSubsidy with the subsidy id when the unlink button is clicked', () => {
    const subsidy = makeSubsidy();
    render(<SubsidyLinkSection {...buildProps({ linkedSubsidies: [subsidy] })} />);

    fireEvent.click(screen.getByRole('button', { name: `Unlink subsidy ${subsidy.name}` }));

    expect(onUnlinkSubsidy).toHaveBeenCalledTimes(1);
    expect(onUnlinkSubsidy).toHaveBeenCalledWith(subsidy.id);
  });

  // ─── Select dropdown / picker row ───────────────────────────────────────────

  it('does not render the picker row when there are no available subsidies', () => {
    render(<SubsidyLinkSection {...buildProps({ availableSubsidies: [] })} />);

    expect(
      screen.queryByRole('combobox', { name: 'Select subsidy program to link' }),
    ).not.toBeInTheDocument();
  });

  it('renders the select dropdown with a placeholder option and the available subsidies', () => {
    const available = [
      makeSubsidy({ id: 'a-1', name: 'Program A' }),
      makeSubsidy({ id: 'a-2', name: 'Program B' }),
    ];
    render(<SubsidyLinkSection {...buildProps({ availableSubsidies: available })} />);

    const select = screen.getByRole('combobox', { name: 'Select subsidy program to link' });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Select subsidy program...' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Program A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Program B' })).toBeInTheDocument();
  });

  it('fires onSelectSubsidy with the selected value when the dropdown changes', () => {
    const available = [makeSubsidy({ id: 'a-1', name: 'Program A' })];
    render(<SubsidyLinkSection {...buildProps({ availableSubsidies: available })} />);

    const select = screen.getByRole('combobox', { name: 'Select subsidy program to link' });
    fireEvent.change(select, { target: { value: 'a-1' } });

    expect(onSelectSubsidy).toHaveBeenCalledTimes(1);
    expect(onSelectSubsidy).toHaveBeenCalledWith('a-1');
  });

  // ─── Add button: label text, disabled state, isLinking ─────────────────────

  it('shows "Add Subsidy" on the add button when not linking', () => {
    const available = [makeSubsidy()];
    render(
      <SubsidyLinkSection
        {...buildProps({ availableSubsidies: available, selectedSubsidyId: 'sub-1' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add Subsidy' })).toBeInTheDocument();
  });

  it('shows "Linking..." on the add button and disables the select while isLinking is true', () => {
    const available = [makeSubsidy()];
    render(
      <SubsidyLinkSection
        {...buildProps({
          availableSubsidies: available,
          selectedSubsidyId: 'sub-1',
          isLinking: true,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Linking...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Linking...' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Select subsidy program to link' })).toBeDisabled();
  });

  it('disables the add button when no subsidy is selected', () => {
    const available = [makeSubsidy()];
    render(
      <SubsidyLinkSection
        {...buildProps({ availableSubsidies: available, selectedSubsidyId: '' })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add Subsidy' })).toBeDisabled();
  });

  it('fires onLinkSubsidy when the add button is clicked', () => {
    const available = [makeSubsidy()];
    render(
      <SubsidyLinkSection
        {...buildProps({ availableSubsidies: available, selectedSubsidyId: 'sub-1' })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Subsidy' }));

    expect(onLinkSubsidy).toHaveBeenCalledTimes(1);
  });

  // ─── children slot ──────────────────────────────────────────────────────────

  it('renders children passed to the component', () => {
    render(
      <SubsidyLinkSection {...buildProps()}>
        <div data-testid="extra-content">Extra</div>
      </SubsidyLinkSection>,
    );

    expect(screen.getByTestId('extra-content')).toBeInTheDocument();
  });
});
