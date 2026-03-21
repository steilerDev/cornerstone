import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

interface TestEntity {
  id: string;
  name: string;
}

// Mock SearchPicker to avoid async complexity — just render a simple input
const mockSearchPickerOnChange = jest.fn<(id: string) => void>();

jest.unstable_mockModule('../../SearchPicker/SearchPicker.js', () => ({
  SearchPicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
  }) => {
    // Keep a ref to onChange so tests can trigger it
    mockSearchPickerOnChange.mockImplementation(onChange);
    return (
      <input
        data-testid="mock-search-picker"
        defaultValue={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

import type * as EntityFilterModule from './EntityFilter.js';

let EntityFilter: (typeof EntityFilterModule)['EntityFilter'];

const mockSearchFn = jest.fn<(query: string, excludeIds: string[]) => Promise<TestEntity[]>>();
const mockRenderItem = (item: TestEntity) => ({ id: item.id, label: item.name });

beforeEach(async () => {
  ({ EntityFilter } = (await import('./EntityFilter.js')) as typeof EntityFilterModule);
  mockSearchFn.mockReset();
  mockSearchPickerOnChange.mockClear();
});

describe('EntityFilter', () => {
  it('renders the SearchPicker component', () => {
    render(
      <EntityFilter
        value=""
        onChange={jest.fn()}
        searchFn={mockSearchFn}
        renderItem={mockRenderItem}
      />,
    );
    expect(screen.getByTestId('mock-search-picker')).toBeInTheDocument();
  });

  it('passes the current value to SearchPicker', () => {
    render(
      <EntityFilter
        value="entity-123"
        onChange={jest.fn()}
        searchFn={mockSearchFn}
        renderItem={mockRenderItem}
      />,
    );
    expect(screen.getByTestId('mock-search-picker')).toHaveValue('entity-123');
  });

  it('passes custom placeholder to SearchPicker', () => {
    render(
      <EntityFilter
        value=""
        onChange={jest.fn()}
        searchFn={mockSearchFn}
        renderItem={mockRenderItem}
        placeholder="Pick a vendor..."
      />,
    );
    expect(screen.getByPlaceholderText('Pick a vendor...')).toBeInTheDocument();
  });

  it('calls onChange when SearchPicker selection changes', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EntityFilter
        value=""
        onChange={mockOnChange}
        searchFn={mockSearchFn}
        renderItem={mockRenderItem}
      />,
    );
    const input = screen.getByTestId('mock-search-picker');
    await user.clear(input);
    await user.type(input, 'vendor-42');
    // The mock input calls onChange on each character — find the last call
    const calls = mockOnChange.mock.calls as [string][];
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall).toContain('vendor-4');
  });

  it('wires onChange directly to SearchPicker onChange prop', () => {
    const mockOnChange = jest.fn();
    render(
      <EntityFilter
        value=""
        onChange={mockOnChange}
        searchFn={mockSearchFn}
        renderItem={mockRenderItem}
      />,
    );
    // Simulate direct invocation of the onChange prop
    mockSearchPickerOnChange('entity-999');
    expect(mockOnChange).toHaveBeenCalledWith('entity-999');
  });
});
