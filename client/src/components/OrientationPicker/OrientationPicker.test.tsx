/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { OrientationResponse } from '@cornerstone/shared';
import type { OrientationPickerProps } from './OrientationPicker.js';

// Module-scope captures for inspecting props passed to mocked SearchPicker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSearchFn: ((query: string) => Promise<any[]>) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedRenderSecondary: ((item: any) => string | null) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSpecialOptions: any[] | undefined;
let capturedOnChange: ((id: string) => void) | null = null;
let capturedEmptyHint: string | undefined = undefined;

const mockFetchOrientations =
  jest.fn<typeof import('../../lib/orientationApi.js').fetchOrientations>();

jest.unstable_mockModule('../../lib/orientationApi.js', () => ({
  fetchOrientations: mockFetchOrientations,
}));

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.unstable_mockModule('../SearchPicker/SearchPicker.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SearchPicker: (props: any) => {
    capturedSearchFn = props.searchFn;
    capturedRenderSecondary = props.renderSecondary;
    capturedSpecialOptions = props.specialOptions;
    capturedOnChange = props.onChange;
    capturedEmptyHint = props.emptyHint;
    return (
      <div
        data-testid="search-picker-mock"
        data-value={props.value}
        data-placeholder={props.placeholder}
        data-show-items-on-focus={String(props.showItemsOnFocus)}
        data-empty-hint={props.emptyHint}
      />
    );
  },
}));

let OrientationPicker: React.ComponentType<OrientationPickerProps>;

beforeEach(async () => {
  if (!OrientationPicker) {
    const mod = await import('./OrientationPicker.js');
    OrientationPicker = mod.OrientationPicker;
  }
  capturedSearchFn = null;
  capturedRenderSecondary = null;
  capturedSpecialOptions = undefined;
  capturedOnChange = null;
  capturedEmptyHint = undefined;
  mockFetchOrientations.mockReset();
});

const makeOrientation = (overrides: Partial<OrientationResponse> = {}): OrientationResponse => ({
  id: 'orient-1',
  name: 'North',
  description: 'Facing north',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('OrientationPicker', () => {
  it('renders without crashing and renders the SearchPicker mock', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} />);
    expect(screen.getByTestId('search-picker-mock')).toBeTruthy();
  });

  it('searchFn calls fetchOrientations with the query', async () => {
    const orientations = [makeOrientation()];
    mockFetchOrientations.mockResolvedValueOnce({ orientations } as Awaited<
      ReturnType<typeof mockFetchOrientations>
    >);

    render(<OrientationPicker value="" onChange={jest.fn()} />);

    let results: OrientationResponse[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('north')) ?? [];
    });

    expect(mockFetchOrientations).toHaveBeenCalledWith({ search: 'north' });
    expect(results).toEqual(orientations);
  });

  it('searchFn called with empty string passes undefined to fetchOrientations', async () => {
    const orientations = [makeOrientation()];
    mockFetchOrientations.mockResolvedValueOnce({ orientations } as Awaited<
      ReturnType<typeof mockFetchOrientations>
    >);

    render(<OrientationPicker value="" onChange={jest.fn()} />);

    await act(async () => {
      await capturedSearchFn?.('');
    });

    expect(mockFetchOrientations).toHaveBeenCalledWith(undefined);
  });

  it('renderSecondary returns description when orientation has a description', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} />);

    const orientation = makeOrientation({ description: 'Facing north' });
    const result = capturedRenderSecondary?.(orientation);
    expect(result).toBe('Facing north');
  });

  it('renderSecondary returns null when orientation has null description', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} />);

    const orientation = makeOrientation({ description: undefined });
    const result = capturedRenderSecondary?.(orientation);
    expect(result).toBeNull();
  });

  it('nullable=true — specialOptions includes the no-orientation entry', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} nullable={true} />);

    expect(capturedSpecialOptions).toBeDefined();
    expect(capturedSpecialOptions).toHaveLength(1);
    expect(capturedSpecialOptions![0]).toEqual({ id: '', label: 'aria.noOrientation' });
  });

  it('nullable=false — specialOptions is undefined', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} nullable={false} />);

    expect(capturedSpecialOptions).toBeUndefined();
  });

  it('onChange is forwarded and called with the correct id', () => {
    const onChangeMock = jest.fn<(id: string) => void>();
    render(<OrientationPicker value="" onChange={onChangeMock} />);

    act(() => {
      capturedOnChange?.('orient-42');
    });

    expect(onChangeMock).toHaveBeenCalledWith('orient-42');
  });

  it('placeholder is set to the selectOrientation translation key', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} />);

    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-placeholder')).toBe('aria.selectOrientation');
  });

  it('showItemsOnFocus is true', () => {
    render(<OrientationPicker value="" onChange={jest.fn()} />);

    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-show-items-on-focus')).toBe('true');
  });

  it('value prop is forwarded to SearchPicker', () => {
    render(<OrientationPicker value="orient-99" onChange={jest.fn()} />);

    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-value')).toBe('orient-99');
  });

  it('emptyHint prop is forwarded to SearchPicker', () => {
    render(
      <OrientationPicker value="" onChange={jest.fn()} emptyHint="No orientations available" />,
    );

    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-empty-hint')).toBe('No orientations available');
    expect(capturedEmptyHint).toBe('No orientations available');
  });
});
