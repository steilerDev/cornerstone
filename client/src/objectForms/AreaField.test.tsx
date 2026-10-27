/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AreaResponse } from '@cornerstone/shared';
import type { ObjectFormRenderContext } from '../components/ObjectForm/types.js';
import { LocaleProvider } from '../contexts/LocaleContext.js';
import { AreaField, buildAreaSummary } from './AreaField.js';

function area(
  id: string,
  name: string,
  parentId: string | null = null,
  color: string | null = null,
) {
  return { id, name, parentId, color, sortOrder: 0 } as AreaResponse;
}

const AREAS = [
  area('a-1', 'Ground floor', null, '#112233'),
  area('a-2', 'Hallway', 'a-1'),
  area('a-3', 'Closet', 'a-2'),
  area('a-4', 'Garden'),
];

function ctxOf(over: Partial<ObjectFormRenderContext> = {}): ObjectFormRenderContext {
  return {
    id: 'area-field',
    value: '',
    setValue: jest.fn(),
    busy: false,
    invalid: false,
    describedBy: undefined,
    createChild: jest.fn(),
    setValues: jest.fn(),
    values: {},
    ...over,
  };
}

describe('buildAreaSummary', () => {
  it('returns the area with its root-first ancestor trail', () => {
    expect(buildAreaSummary('a-3', AREAS)).toEqual({
      id: 'a-3',
      name: 'Closet',
      color: null,
      ancestors: [
        { id: 'a-1', name: 'Ground floor', color: '#112233' },
        { id: 'a-2', name: 'Hallway', color: null },
      ],
    });
  });

  it('has no ancestors for a top-level area', () => {
    expect(buildAreaSummary('a-4', AREAS)?.ancestors).toEqual([]);
  });

  it('returns null for an unknown id', () => {
    expect(buildAreaSummary('nope', AREAS)).toBeNull();
  });
});

describe('AreaField', () => {
  it('is an area EntityPicker with the form field id and a "No area" row', async () => {
    const user = userEvent.setup();
    const setValue = jest.fn();
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ setValue })} areas={AREAS} />
      </LocaleProvider>,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'area-field');
    expect(input).toHaveAttribute('placeholder', 'Select an area');
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'No area' }));

    expect(setValue.mock.calls[0]?.[0]).toBe('');
  });

  it('writes the picked area id to the form', async () => {
    const user = userEvent.setup();
    const setValue = jest.fn();
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ setValue })} areas={AREAS} />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole('textbox'));
    await user.click(await screen.findByRole('option', { name: 'Ground floor, Hallway' }));

    expect(setValue.mock.calls[0]?.[0]).toBe('a-2');
  });

  it('shows the current area as its full path', () => {
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ value: 'a-3' })} areas={AREAS} />
      </LocaleProvider>,
    );

    expect(screen.getByText('Ground floor › Hallway › Closet')).toBeInTheDocument();
  });

  it('treats a non-text value as no area', () => {
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ value: undefined })} areas={AREAS} preview />
      </LocaleProvider>,
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('is disabled while the form is busy', () => {
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ busy: true })} areas={AREAS} />
      </LocaleProvider>,
    );

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows no breadcrumb preview by default', () => {
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ value: 'a-3' })} areas={AREAS} />
      </LocaleProvider>,
    );

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows the breadcrumb of the chosen area when preview is on', () => {
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ value: 'a-3' })} areas={AREAS} preview />
      </LocaleProvider>,
    );

    const trail = screen.getByRole('navigation');
    expect(trail).toHaveTextContent('Ground floor');
    expect(trail).toHaveTextContent('Hallway');
    expect(trail).toHaveTextContent('Closet');
  });

  it('shows no preview while nothing is chosen', () => {
    render(
      <LocaleProvider>
        <AreaField ctx={ctxOf({ value: '' })} areas={AREAS} preview />
      </LocaleProvider>,
    );

    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
