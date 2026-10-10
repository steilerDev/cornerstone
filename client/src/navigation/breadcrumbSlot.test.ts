import { describe, it, expect } from '@jest/globals';
import { createElement, use } from 'react';
import { render, screen } from '@testing-library/react';
import { BreadcrumbSlotContext, TOP_BAR_MEDIA_QUERY } from './breadcrumbSlot.js';

function Probe() {
  const slot = use(BreadcrumbSlotContext);
  return createElement('p', { 'data-testid': 'probe' }, slot ? slot.id : 'none');
}

describe('breadcrumbSlot', () => {
  it('uses the same 1024 px threshold as the shell breakpoint', () => {
    expect(TOP_BAR_MEDIA_QUERY).toBe('(min-width: 1024px)');
  });

  it('defaults to null outside a provider', () => {
    render(createElement(Probe));
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('provides the slot element to consumers', () => {
    const el = document.createElement('div');
    el.id = 'slot-1';
    render(createElement(BreadcrumbSlotContext, { value: el }, createElement(Probe)));
    expect(screen.getByTestId('probe')).toHaveTextContent('slot-1');
  });
});
