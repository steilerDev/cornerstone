/**
 * @jest-environment jsdom
 */
/**
 * EntityMultiPicker (#2242): the defensive paths of a pick, with the single picker stubbed so a
 * pick can carry no option.
 *
 * Mutations: a pick of an unknown id with no option still adding a chip; a special row looked up
 * in the wrong list; a duplicate pick being added twice.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as MultiModule from './EntityMultiPicker.js';
import type { EntityOption } from './types.js';

jest.unstable_mockModule('./EntityPicker.js', () => ({
  EntityPicker: ({
    onChange,
    excludeIds,
  }: {
    onChange: (value: string, option: EntityOption | null) => void;
    excludeIds?: readonly string[];
  }) => (
    <div data-testid="stub" data-exclude={(excludeIds ?? []).join(',')}>
      <button type="button" data-testid="pick-unknown" onClick={() => onChange('zzz', null)} />
      <button type="button" data-testid="pick-special" onClick={() => onChange('__s__', null)} />
      <button
        type="button"
        data-testid="pick-dup"
        onClick={() => onChange('o-1', { id: 'o-1', label: 'One' })}
      />
    </div>
  ),
}));

describe('EntityMultiPicker defensive picks', () => {
  let Module: typeof MultiModule;
  const onChange = jest.fn<(next: readonly EntityOption[]) => void>();

  beforeEach(async () => {
    onChange.mockReset();
    if (!Module) Module = await import('./EntityMultiPicker.js');
  });

  const renderIt = (specialOptions?: { id: string; label: string }[], value: EntityOption[] = []) =>
    render(
      <Module.EntityMultiPicker
        value={value}
        onChange={onChange}
        picker={{ kind: 'company', specialOptions }}
        removeLabel={(option) => `Remove ${option.label}`}
        countLabel={(count) => `${count}`}
        testId="multi"
      />,
    );

  it('ignores a pick with no option that is not a special row (no specials at all)', () => {
    renderIt();
    fireEvent.click(screen.getByTestId('pick-unknown'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a pick with no option that matches none of the special rows', () => {
    renderIt([{ id: '__other__', label: 'Other' }]);
    fireEvent.click(screen.getByTestId('pick-unknown'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns a matching special row into a chip', () => {
    renderIt([{ id: '__s__', label: 'Special' }]);
    fireEvent.click(screen.getByTestId('pick-special'));
    expect(onChange).toHaveBeenCalledWith([{ id: '__s__', label: 'Special' }]);
  });

  it('does not add an already chosen id a second time, and excludes it from the results', () => {
    renderIt(undefined, [{ id: 'o-1', label: 'One' }]);
    fireEvent.click(screen.getByTestId('pick-dup'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('stub')).toHaveAttribute('data-exclude', 'o-1');
  });
});
