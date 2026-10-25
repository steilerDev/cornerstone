/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeBreakdown } from '../../test/breakdownFixtures.js';
import type * as ToolbarModule from './BreakdownToolbar.js';
import type { BreakdownSettings } from './breakdownSettings.js';

/**
 * The chip groups hand back a plain string. The toolbar must forward only members of the
 * union it owns, so a foreign value (a stale chip, a future option) never reaches the host.
 */
interface CapturedGroup {
  testIdPrefix?: string;
  onChange: (value: string) => void;
}
const captured: CapturedGroup[] = [];

jest.unstable_mockModule('../FilterChipGroup/FilterChipGroup.js', () => ({
  FilterChipGroup: (props: CapturedGroup) => {
    captured.push(props);
    return null;
  },
}));

let BreakdownToolbar: (typeof ToolbarModule)['BreakdownToolbar'];

beforeAll(async () => {
  ({ BreakdownToolbar } = (await import('./BreakdownToolbar.js')) as typeof ToolbarModule);
});

const settings: BreakdownSettings = {
  view: 'area',
  payment: 'all',
  estimate: 'expected',
  grants: false,
  deselected: new Set(),
};

describe('BreakdownToolbar value guards', () => {
  it('forwards members of each union and drops foreign values', () => {
    const onViewChange = jest.fn();
    const onPaymentChange = jest.fn();
    const onEstimateChange = jest.fn();
    render(
      <MemoryRouter>
        <BreakdownToolbar
          breakdown={makeBreakdown()}
          settings={settings}
          onViewChange={onViewChange}
          onPaymentChange={onPaymentChange}
          onEstimateChange={onEstimateChange}
          onGrantsChange={jest.fn()}
          onSourceToggle={jest.fn()}
          onSelectAllSources={jest.fn()}
        />
      </MemoryRouter>,
    );
    const group = (prefix: string) => captured.find((g) => g.testIdPrefix === prefix)!;

    group('breakdown-view').onChange('bogus');
    group('breakdown-payment').onChange('bogus');
    group('breakdown-estimate').onChange('bogus');
    expect(onViewChange).not.toHaveBeenCalled();
    expect(onPaymentChange).not.toHaveBeenCalled();
    expect(onEstimateChange).not.toHaveBeenCalled();

    group('breakdown-view').onChange('type');
    group('breakdown-payment').onChange('paid');
    group('breakdown-estimate').onChange('high');
    expect(onViewChange).toHaveBeenCalledWith('type');
    expect(onPaymentChange).toHaveBeenCalledWith('paid');
    expect(onEstimateChange).toHaveBeenCalledWith('high');
  });
});
