import type { ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RenderOptions } from '@testing-library/react';

interface WrapperOptions {
  initialEntries?: string[];
  initialIndex?: number;
}

/**
 * Render a component wrapped in MemoryRouter for testing routing behavior
 */
export function renderWithRouter(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    initialIndex = 0,
    ...renderOptions
  }: WrapperOptions & RenderOptions = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        {children}
      </MemoryRouter>
    ),
    ...renderOptions,
  });
}
