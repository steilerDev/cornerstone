import { renderHook } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { BudgetSource } from '@cornerstone/shared';
import { useReportPreset } from './useReportPreset.js';

const loan = { id: 'loan-1', sourceType: 'bank_loan', status: 'active' } as BudgetSource;

function setup(
  url: string,
  initial: { ready: boolean; useCase: string | null; sources: BudgetSource[] },
) {
  const apply = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  const hook = renderHook(
    (p: typeof initial) => useReportPreset(p.ready, p.sources, apply, p.useCase),
    { wrapper, initialProps: initial },
  );
  return { apply, ...hook };
}

describe('useReportPreset', () => {
  it('applies a known type and source once the sources are ready', () => {
    const { apply } = setup('/?type=claim&sourceId=loan-1', {
      ready: true,
      useCase: null,
      sources: [loan],
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ type: 'claim', sourceId: 'loan-1', sourceMissing: false });
  });

  it('waits until the sources are ready', () => {
    const { apply, rerender } = setup('/?type=claim', { ready: false, useCase: null, sources: [] });
    expect(apply).not.toHaveBeenCalled();
    rerender({ ready: true, useCase: null, sources: [loan] });
    expect(apply).toHaveBeenCalledWith({ type: 'claim', sourceId: 'loan-1', sourceMissing: false });
  });

  it('does not re-fire for the same pair when sources reload', () => {
    const { apply, rerender } = setup('/?type=claim', {
      ready: true,
      useCase: null,
      sources: [loan],
    });
    rerender({
      ready: true,
      useCase: null,
      sources: [loan, { ...loan, id: 'loan-2' } as BudgetSource],
    });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('does nothing once a use case is chosen', () => {
    const { apply } = setup('/?type=claim&sourceId=loan-1', {
      ready: true,
      useCase: 'claim',
      sources: [loan],
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('does nothing without a valid type (a sourceId alone is not a preset)', () => {
    const none = setup('/?sourceId=loan-1', { ready: true, useCase: null, sources: [loan] });
    const bad = setup('/?type=zzz&sourceId=loan-1', {
      ready: true,
      useCase: null,
      sources: [loan],
    });
    expect(none.apply).not.toHaveBeenCalled();
    expect(bad.apply).not.toHaveBeenCalled();
  });

  it('flags an unknown source id', () => {
    const { apply } = setup('/?type=claim&sourceId=gone', {
      ready: true,
      useCase: null,
      sources: [loan],
    });
    expect(apply).toHaveBeenCalledWith({ type: 'claim', sourceId: null, sourceMissing: true });
  });
});
