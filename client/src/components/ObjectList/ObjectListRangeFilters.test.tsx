/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DateRangeFilter, NumberRangeFilter } from './ObjectListRangeFilters.js';

type Writes = Array<string | null>;

function DateHarness({
  initial = null,
  writes,
  applyWrites = true,
}: {
  initial?: string | null;
  writes: Writes;
  applyWrites?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <button type="button" onClick={() => setValue('from:2026-02-01,to:2026-03-01')}>
        external
      </button>
      <DateRangeFilter
        ctx={{
          id: 'f-date',
          value,
          onChange: (next) => {
            writes.push(next);
            if (applyWrites) setValue(next);
          },
        }}
        testId="range-date"
        labels={{ from: 'From day', to: 'To day' }}
      />
    </>
  );
}

describe('DateRangeFilter', () => {
  const from = () => screen.getByTestId('range-date-from') as HTMLInputElement;
  const to = () => screen.getByTestId('range-date-to') as HTMLInputElement;

  it('labels the inputs and writes from:…,to:… on every change; an empty range clears', () => {
    const writes: Writes = [];
    render(<DateHarness writes={writes} />);
    expect(screen.getByLabelText('From day')).toBe(from());
    expect(screen.getByLabelText('To day')).toBe(to());
    fireEvent.change(from(), { target: { value: '2026-01-01' } });
    expect(writes.at(-1)).toBe('from:2026-01-01');
    fireEvent.change(to(), { target: { value: '2026-02-01' } });
    expect(writes.at(-1)).toBe('from:2026-01-01,to:2026-02-01');
    fireEvent.change(from(), { target: { value: '' } });
    expect(writes.at(-1)).toBe('to:2026-02-01');
    fireEvent.change(to(), { target: { value: '' } });
    expect(writes.at(-1)).toBeNull();
  });

  it('shows both sides from the value', () => {
    render(<DateHarness writes={[]} initial="from:2026-04-01,to:2026-05-01" />);
    expect(from().value).toBe('2026-04-01');
    expect(to().value).toBe('2026-05-01');
  });

  it('keeps the typed value while the URL lags and syncs from the URL when it changes', async () => {
    const writes: Writes = [];
    render(<DateHarness writes={writes} applyWrites={false} />);
    fireEvent.change(from(), { target: { value: '2026-03-03' } });
    expect(from().value).toBe('2026-03-03');
    fireEvent.change(to(), { target: { value: '2026-03-09' } });
    expect(to().value).toBe('2026-03-09');
    fireEvent.click(screen.getByText('external'));
    await waitFor(() => expect(from().value).toBe('2026-02-01'));
    expect(to().value).toBe('2026-03-01');
  });
});

function NumberHarness({ initial = null, writes }: { initial?: string | null; writes: Writes }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <button type="button" onClick={() => setValue('min:7,max:9')}>
        external
      </button>
      <NumberRangeFilter
        ctx={{
          id: 'f-num',
          value,
          onChange: (next) => {
            writes.push(next);
            setValue(next);
          },
        }}
        testId="range-num"
        labels={{ min: 'At least', max: 'At most' }}
        step="1"
      />
    </>
  );
}

describe('NumberRangeFilter', () => {
  const min = () => screen.getByTestId('range-num-min') as HTMLInputElement;
  const max = () => screen.getByTestId('range-num-max') as HTMLInputElement;

  it('labels the inputs and applies the step', () => {
    render(<NumberHarness writes={[]} />);
    expect(screen.getByLabelText('At least')).toBe(min());
    expect(screen.getByLabelText('At most')).toBe(max());
    expect(min()).toHaveAttribute('step', '1');
    expect(max()).toHaveAttribute('min', '0');
  });

  it('commits on blur', () => {
    const writes: Writes = [];
    render(<NumberHarness writes={writes} />);
    fireEvent.change(min(), { target: { value: '10' } });
    expect(writes).toEqual([]);
    fireEvent.blur(min());
    expect(writes).toEqual(['min:10']);
    fireEvent.change(max(), { target: { value: '250.5' } });
    fireEvent.blur(max());
    expect(writes.at(-1)).toBe('min:10,max:250.5');
  });

  it('commits on Enter and ignores other keys', () => {
    const writes: Writes = [];
    render(<NumberHarness writes={writes} />);
    fireEvent.change(max(), { target: { value: '99' } });
    fireEvent.keyDown(max(), { key: 'a' });
    expect(writes).toEqual([]);
    fireEvent.keyDown(max(), { key: 'Enter' });
    expect(writes).toEqual(['max:99']);
    fireEvent.change(min(), { target: { value: '3' } });
    fireEvent.keyDown(min(), { key: 'Enter' });
    expect(writes.at(-1)).toBe('min:3,max:99');
  });

  it('does not write again when nothing changed', () => {
    const writes: Writes = [];
    render(<NumberHarness writes={writes} initial="min:10" />);
    expect(min().value).toBe('10');
    fireEvent.blur(min());
    expect(writes).toEqual([]);
  });

  it('clears the param when both fields are emptied', () => {
    const writes: Writes = [];
    render(<NumberHarness writes={writes} initial="min:10,max:20" />);
    fireEvent.change(min(), { target: { value: '' } });
    fireEvent.change(max(), { target: { value: '' } });
    fireEvent.blur(max());
    expect(writes).toEqual([null]);
  });

  it('drops negative and non-numeric drafts instead of writing them', () => {
    const writes: Writes = [];
    render(<NumberHarness writes={writes} />);
    fireEvent.change(min(), { target: { value: '-5' } });
    fireEvent.blur(min());
    expect(writes).toEqual([]);
    fireEvent.change(max(), { target: { value: '0' } });
    fireEvent.blur(max());
    expect(writes).toEqual(['max:0']);
  });

  it('syncs the drafts from the URL when it changes', async () => {
    render(<NumberHarness writes={[]} initial="min:1" />);
    expect(min().value).toBe('1');
    expect(max().value).toBe('');
    fireEvent.click(screen.getByText('external'));
    await waitFor(() => expect(min().value).toBe('7'));
    expect(max().value).toBe('9');
  });

  it('blurs a number field on wheel so scrolling never changes it', () => {
    render(<NumberHarness writes={[]} />);
    min().focus();
    fireEvent.wheel(min());
    expect(min()).not.toHaveFocus();
    max().focus();
    fireEvent.wheel(max());
    expect(max()).not.toHaveFocus();
  });
});
