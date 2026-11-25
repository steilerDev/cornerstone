/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SkipLink, MAIN_CONTENT_ID } from './SkipLink.js';

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="loc">{`${location.pathname}${location.hash}`}</p>;
}

function renderSkipLink(main: React.ReactNode = <main id={MAIN_CONTENT_ID}>Page</main>) {
  return render(
    <MemoryRouter initialEntries={['/synthetic']}>
      <SkipLink />
      {main}
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('SkipLink (#2261)', () => {
  it('exports the id of the shell main', () => {
    expect(MAIN_CONTENT_ID).toBe('main-content');
  });

  it('renders a plain anchor to #main-content with the text "Skip to content"', () => {
    renderSkipLink();

    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('is the first tab stop in the document', async () => {
    const user = userEvent.setup();
    renderSkipLink();

    await user.tab();

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  });

  it('activating it focuses main, adds tabindex=-1, and neither navigates nor changes the hash', async () => {
    const user = userEvent.setup();
    window.location.hash = '';
    renderSkipLink();
    const main = document.getElementById(MAIN_CONTENT_ID) as HTMLElement;
    expect(main).not.toHaveAttribute('tabindex');

    await user.click(screen.getByRole('link', { name: 'Skip to content' }));

    expect(main).toHaveFocus();
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(window.location.hash).toBe('');
    expect(screen.getByTestId('loc')).toHaveTextContent('/synthetic');
    expect(screen.getByTestId('loc')).not.toHaveTextContent('#');
  });

  it('calls preventDefault on the click', () => {
    renderSkipLink();
    const link = screen.getByRole('link', { name: 'Skip to content' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps a tabindex that main already has', async () => {
    const user = userEvent.setup();
    renderSkipLink(
      <main id={MAIN_CONTENT_ID} tabIndex={0}>
        Page
      </main>,
    );

    await user.click(screen.getByRole('link', { name: 'Skip to content' }));

    const main = document.getElementById(MAIN_CONTENT_ID);
    expect(main).toHaveAttribute('tabindex', '0');
    expect(main).toHaveFocus();
  });

  it('does not throw when the page has no main#main-content', async () => {
    const user = userEvent.setup();
    renderSkipLink(<div>No landmark</div>);
    const link = screen.getByRole('link', { name: 'Skip to content' });

    await user.click(link);

    expect(link).toHaveFocus();
    expect(screen.getByTestId('loc')).toHaveTextContent('/synthetic');
  });
});
