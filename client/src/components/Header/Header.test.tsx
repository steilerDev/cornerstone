import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';

describe('Header', () => {
  it('renders menu toggle button with "Open menu" aria-label when sidebar is closed', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button).toBeInTheDocument();
  });

  it('calls onToggleSidebar when menu button is clicked', async () => {
    const mockToggle = jest.fn();
    const user = userEvent.setup();

    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    await user.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleSidebar multiple times on repeated clicks', async () => {
    const mockToggle = jest.fn();
    const user = userEvent.setup();

    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(3);
  });

  it('renders title area with correct data-testid', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const titleArea = screen.getByTestId('page-title');
    expect(titleArea).toBeInTheDocument();
  });

  it('menu button has type="button" to prevent form submission', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('shows ☰ icon when sidebar is closed', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button).toHaveTextContent('☰');
  });

  it('shows ✕ icon when sidebar is open', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={true} />);

    const button = screen.getByRole('button', { name: /close menu/i });
    expect(button).toHaveTextContent('✕');
  });

  it('has "Open menu" aria-label when sidebar is closed', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={false} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button).toHaveAttribute('aria-label', 'Open menu');
  });

  it('has "Close menu" aria-label when sidebar is open', () => {
    const mockToggle = jest.fn();
    render(<Header onToggleSidebar={mockToggle} isSidebarOpen={true} />);

    const button = screen.getByRole('button', { name: /close menu/i });
    expect(button).toHaveAttribute('aria-label', 'Close menu');
  });
});
