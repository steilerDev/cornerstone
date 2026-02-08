import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';

describe('Header', () => {
  it('renders menu toggle button with correct aria-label', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} />);

    const button = screen.getByRole('button', { name: /toggle navigation menu/i });
    expect(button).toBeInTheDocument();
  });

  it('calls onToggleSidebar when menu button is clicked', async () => {
    const mockToggle = jest.fn();
    const user = userEvent.setup();

    render(<Header onToggleSidebar={mockToggle} />);

    const button = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleSidebar multiple times on repeated clicks', async () => {
    const mockToggle = jest.fn();
    const user = userEvent.setup();

    render(<Header onToggleSidebar={mockToggle} />);

    const button = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(3);
  });

  it('renders title area with correct data-testid', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} />);

    const titleArea = screen.getByTestId('page-title');
    expect(titleArea).toBeInTheDocument();
  });

  it('menu button has type="button" to prevent form submission', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} />);

    const button = screen.getByRole('button', { name: /toggle navigation menu/i });
    expect(button).toHaveAttribute('type', 'button');
  });
});
