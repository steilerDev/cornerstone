/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SourceReportType } from '@cornerstone/shared';
import { useReportTypePreset } from './useReportTypePreset.js';

function setup(url: string, ready: boolean, useCase: SourceReportType | null) {
  const apply = jest.fn<(type: SourceReportType) => void>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  const view = renderHook(
    (props: { ready: boolean; useCase: SourceReportType | null }) =>
      useReportTypePreset(props.ready, props.useCase, apply),
    { wrapper, initialProps: { ready, useCase } },
  );
  return { apply, ...view };
}

describe('useReportTypePreset', () => {
  it.each(['budget-overview', 'claim', 'proof-of-funds'] as const)(
    'applies ?type=%s once when ready and no use case is chosen',
    (type) => {
      const { apply } = setup(`/reports?type=${type}`, true, null);
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith(type);
    },
  );

  it('does nothing without a type param', () => {
    const { apply } = setup('/reports', true, null);
    expect(apply).not.toHaveBeenCalled();
  });

  it('ignores an unknown type value', () => {
    const { apply } = setup('/reports?type=nonsense', true, null);
    expect(apply).not.toHaveBeenCalled();
  });

  it('ignores an empty type value', () => {
    const { apply } = setup('/reports?type=', true, null);
    expect(apply).not.toHaveBeenCalled();
  });

  it('waits until the wizard is ready, then applies', () => {
    const { apply, rerender } = setup('/reports?type=claim', false, null);
    expect(apply).not.toHaveBeenCalled();
    rerender({ ready: true, useCase: null });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('claim');
  });

  it('does not override a use case that is already chosen', () => {
    const { apply } = setup('/reports?type=claim', true, 'proof-of-funds');
    expect(apply).not.toHaveBeenCalled();
  });

  it('does not apply again when the user clears the use case afterwards', () => {
    const { apply, rerender } = setup('/reports?type=claim', true, null);
    expect(apply).toHaveBeenCalledTimes(1);
    rerender({ ready: true, useCase: 'claim' });
    rerender({ ready: true, useCase: null });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('does not apply again when ready flips off and on', () => {
    const { apply, rerender } = setup('/reports?type=claim', true, null);
    rerender({ ready: false, useCase: null });
    rerender({ ready: true, useCase: null });
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
