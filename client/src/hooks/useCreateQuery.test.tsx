/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { createReservedParams, useCreateQuery } from './useCreateQuery.js';
import type { CreateRequest, UseCreateQueryOptions } from './useCreateQuery.js';

function Host(
  props: Omit<UseCreateQueryOptions, 'onOpen'> & { onOpen: (r: CreateRequest) => void },
) {
  useCreateQuery(props);
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
  return (
    <div>
      <output data-testid="nav-action">{navigationType}</output>
      <output data-testid="url">{location.pathname + location.search}</output>
      <button
        type="button"
        data-testid="request"
        onClick={() => setSearchParams({ create: '1', kind: 'offer', companyId: 'c9' })}
      />
      <button type="button" data-testid="other" onClick={() => setSearchParams({ q: 'x' })} />
    </div>
  );
}

function setup(url: string, props: Partial<UseCreateQueryOptions> = {}) {
  const onOpen = jest.fn<(r: CreateRequest) => void>();
  const utils = render(
    <MemoryRouter initialEntries={[url]}>
      <Host onOpen={onOpen} {...props} />
    </MemoryRouter>,
  );
  return { onOpen, ...utils };
}

const url = () => screen.getByTestId('url').textContent;

describe('useCreateQuery', () => {
  it('opens once on mount for ?create=1 and passes kind and sanitized prefill', () => {
    const { onOpen } = setup('/p?create=1&kind=offer&companyId=c1&areaId=bad/id', {
      prefillKeys: ['companyId'],
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ kind: 'offer', prefill: { companyId: 'c1' } });
  });

  it('passes a null kind when none is given', () => {
    const { onOpen } = setup('/p?create=1');
    expect(onOpen).toHaveBeenCalledWith({ kind: null, prefill: {} });
  });

  it('clears create, kind and the declared prefill keys and keeps every other param', () => {
    setup('/p?create=1&kind=offer&companyId=c1&sortBy=date&page=2', { prefillKeys: ['companyId'] });
    expect(url()).toBe('/p?sortBy=date&page=2');
  });

  it('leaves an undeclared prefill key in the URL', () => {
    setup('/p?create=1&companyId=c1', { prefillKeys: [] });
    expect(url()).toBe('/p?companyId=c1');
  });

  it('removes the params with replace (no new history entry)', () => {
    const { onOpen } = setup('/p?create=1');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(url()).toBe('/p');
    expect(screen.getByTestId('nav-action').textContent).toBe('REPLACE');
  });

  it('does nothing and writes nothing when the URL is clean', () => {
    const { onOpen } = setup('/p?q=a');
    expect(onOpen).not.toHaveBeenCalled();
    expect(url()).toBe('/p?q=a');
  });

  it('ignores create values other than 1', () => {
    const { onOpen } = setup('/p?create=0');
    expect(onOpen).not.toHaveBeenCalled();
    expect(url()).toBe('/p?create=0');
  });

  it('fires once per occurrence: a later request while mounted opens again', () => {
    const { onOpen } = setup('/p?create=1', { prefillKeys: ['companyId'] });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('request'));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith({ kind: 'offer', prefill: { companyId: 'c9' } });
    expect(url()).toBe('/p');
  });

  it('does not fire again for unrelated URL changes', () => {
    const { onOpen } = setup('/p?create=1');
    fireEvent.click(screen.getByTestId('other'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('waits for ready, then opens once and clears the params', () => {
    const onOpen = jest.fn<(r: CreateRequest) => void>();
    const tree = (ready: boolean) => (
      <MemoryRouter initialEntries={['/p?create=1&kind=offer']}>
        <Host ready={ready} onOpen={onOpen} />
      </MemoryRouter>
    );
    const { rerender } = render(tree(false));
    expect(onOpen).not.toHaveBeenCalled();
    expect(url()).toBe('/p?create=1&kind=offer');
    rerender(tree(true));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(url()).toBe('/p');
  });

  it('a re-render does not reopen after the params were cleared', () => {
    const onOpen = jest.fn<(r: CreateRequest) => void>();
    const tree = (n: number) => (
      <MemoryRouter initialEntries={['/p?create=1']}>
        <Host onOpen={onOpen} key="same" />
        <span>{n}</span>
      </MemoryRouter>
    );
    const { rerender } = render(tree(1));
    act(() => {
      rerender(tree(2));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('createReservedParams', () => {
  it('lists create, kind and the given prefill keys', () => {
    expect(createReservedParams(['companyId'])).toEqual(['create', 'kind', 'companyId']);
    expect(createReservedParams()).toEqual(['create', 'kind']);
  });
});
