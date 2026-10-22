/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageLayout } from './PageLayout.js';

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

describe('PageLayout maxWidth="column" and subtitle (#2230)', () => {
  it('adds the column container class', () => {
    render(
      <PageLayout title="Home" maxWidth="column" testId="p">
        <p>x</p>
      </PageLayout>,
    );
    expect(screen.getByTestId('p')).toHaveClass('containerColumn');
    expect(screen.getByTestId('p')).not.toHaveClass('containerNarrow');
  });

  it('keeps narrow and wide unchanged', () => {
    const { unmount } = render(
      <PageLayout title="A" maxWidth="narrow" testId="p">
        <p>x</p>
      </PageLayout>,
    );
    expect(screen.getByTestId('p')).toHaveClass('containerNarrow');
    unmount();
    render(
      <PageLayout title="A" testId="p">
        <p>x</p>
      </PageLayout>,
    );
    expect(screen.getByTestId('p')).not.toHaveClass('containerNarrow');
    expect(screen.getByTestId('p')).not.toHaveClass('containerColumn');
  });

  it('renders the subtitle under the title in the title column and flags the header', () => {
    const { container } = render(
      <PageLayout
        title="Home"
        subtitle="Synthetic House · Tuesday, March 10, 2026"
        action={<b>⋯</b>}
      >
        <p>x</p>
      </PageLayout>,
    );
    const subtitle = screen.getByText('Synthetic House · Tuesday, March 10, 2026');
    expect(subtitle.tagName).toBe('P');
    expect(subtitle).toHaveClass('subtitle');
    expect(subtitle.parentElement).toHaveClass('titleColumn');
    expect(subtitle.parentElement).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Home' }),
    );
    expect(container.querySelector('.header')).toHaveClass('headerWithSubtitle');
    expect(screen.getByText('⋯').parentElement).toHaveClass('action');
  });

  it('has no title column or subtitle paragraph without a subtitle', () => {
    const { container } = render(
      <PageLayout title="Home">
        <p>x</p>
      </PageLayout>,
    );
    expect(container.querySelector('.titleColumn')).toBeNull();
    expect(container.querySelector('.subtitle')).toBeNull();
    expect(container.querySelector('.header')).not.toHaveClass('headerWithSubtitle');
  });
});
