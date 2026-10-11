/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CompanyCreateContext } from './companyCreateContext.js';
import type { RequestCompanyCreate } from './companyCreateContext.js';
import type { CompanyOption } from './companyForm.js';
import { useCompanyCreateAction } from './useCompanyCreateAction.js';

function withRequest(request: RequestCompanyCreate | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CompanyCreateContext value={request}>{children}</CompanyCreateContext>;
  };
}

describe('useCompanyCreateAction', () => {
  it('has no create action and is not creating outside a CompanyCreateProvider', () => {
    const { result } = renderHook(() => useCompanyCreateAction());

    expect(result.current.createAction).toBeUndefined();
    expect(result.current.isCreating).toBe(false);
  });

  it('is the "New company ‹text›" row, shown only when no result equals the text', () => {
    const { result } = renderHook(() => useCompanyCreateAction(), {
      wrapper: withRequest(jest.fn<RequestCompanyCreate>()),
    });

    expect(result.current.createAction?.show).toBe('noExactMatch');
    expect(result.current.createAction?.getLabel('Brand New Co')).toBe('New company Brand New Co');
  });

  it('asks the provider for the typed name and resolves with the created company', async () => {
    const created: CompanyOption = { id: 'c-1', name: 'Brand New Co' };
    const request = jest.fn<RequestCompanyCreate>().mockResolvedValue(created);
    const { result } = renderHook(() => useCompanyCreateAction(), {
      wrapper: withRequest(request),
    });

    let resolved: CompanyOption | null = null;
    await act(async () => {
      resolved = await result.current.createAction!.onCreate('Brand New Co');
    });

    expect(request).toHaveBeenCalledWith('Brand New Co');
    expect(resolved).toBe(created);
  });

  it('resolves null when the dialog is cancelled', async () => {
    const request = jest.fn<RequestCompanyCreate>().mockResolvedValue(null);
    const { result } = renderHook(() => useCompanyCreateAction(), {
      wrapper: withRequest(request),
    });

    let resolved: CompanyOption | null | undefined;
    await act(async () => {
      resolved = await result.current.createAction!.onCreate('x');
    });

    expect(resolved).toBeNull();
  });

  it('isCreating is true while the dialog is open and false after it closes', async () => {
    let finish: (company: CompanyOption | null) => void = () => {};
    const request = jest.fn<RequestCompanyCreate>(
      () => new Promise<CompanyOption | null>((resolve) => (finish = resolve)),
    );
    const { result } = renderHook(() => useCompanyCreateAction(), {
      wrapper: withRequest(request),
    });
    expect(result.current.isCreating).toBe(false);

    let pending: Promise<CompanyOption | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.createAction!.onCreate('x');
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      finish({ id: 'c-1', name: 'x' });
      await pending;
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('resets isCreating when the request rejects, and rethrows', async () => {
    const request = jest.fn<RequestCompanyCreate>().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCompanyCreateAction(), {
      wrapper: withRequest(request),
    });

    await act(async () => {
      await expect(result.current.createAction!.onCreate('x')).rejects.toThrow('boom');
    });

    expect(result.current.isCreating).toBe(false);
  });

  it('keeps the same createAction between renders', () => {
    const request = jest.fn<RequestCompanyCreate>();
    const { result, rerender } = renderHook(() => useCompanyCreateAction(), {
      wrapper: withRequest(request),
    });
    const first = result.current.createAction;

    rerender();

    expect(result.current.createAction).toBe(first);
  });

  it('calls the newest provider request after the provider changes it', async () => {
    const first = jest.fn<RequestCompanyCreate>().mockResolvedValue(null);
    const second = jest.fn<RequestCompanyCreate>().mockResolvedValue(null);
    let current = first;
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <CompanyCreateContext value={current}>{children}</CompanyCreateContext>
    );
    const { result, rerender } = renderHook(() => useCompanyCreateAction(), { wrapper: Wrapper });
    const staleAction = result.current.createAction!;

    current = second;
    rerender();
    await act(async () => {
      await staleAction.onCreate('x');
    });

    expect(second).toHaveBeenCalledWith('x');
    expect(first).not.toHaveBeenCalled();
  });

  // Pages import this hook; importing ObjectForm there would raise their primaryButtons baseline.
  it('never imports ObjectForm', () => {
    const source = readFileSync(new URL('./useCompanyCreateAction.ts', import.meta.url), 'utf8');
    const contextSource = readFileSync(
      new URL('./companyCreateContext.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"][^'"]*ObjectForm/);
    expect(contextSource).not.toMatch(/from\s+['"][^'"]*ObjectForm/);
  });
});
