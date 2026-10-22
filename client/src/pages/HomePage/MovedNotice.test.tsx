/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HOME_HELP_URL } from '../../lib/externalLinks.js';
import { MovedNotice } from './MovedNotice.js';

describe('MovedNotice', () => {
  it('explains what changed and links to the help page in a new tab', () => {
    render(<MovedNotice onDismiss={jest.fn()} />);

    expect(screen.getByText('Home has changed.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /What moved where/ });
    expect(link).toHaveAttribute('href', HOME_HELP_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it('is a static banner, not a live region', () => {
    render(<MovedNotice onDismiss={jest.fn()} />);
    const notice = screen.getByTestId('home-moved-notice');
    expect(notice).not.toHaveAttribute('aria-live');
    expect(notice).not.toHaveAttribute('role', 'status');
  });

  it('closes with the neutral icon button, not a text button', () => {
    render(<MovedNotice onDismiss={jest.fn()} />);
    const close = screen.getByRole('button', { name: 'Dismiss' });
    expect(close.className).toMatch(/noticeClose/);
    expect(close.className).not.toMatch(/btnText|btnPrimary/);
  });

  it('dismisses once and moves focus to the page heading', async () => {
    const onDismiss = jest.fn();
    render(
      <main>
        <h1>Home</h1>
        <MovedNotice onDismiss={onDismiss} />
      </main>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toHaveFocus();
  });
});
