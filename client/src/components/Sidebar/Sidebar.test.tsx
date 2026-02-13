import { jest } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';
import { renderWithRouter } from '../../test/testUtils';

describe('Sidebar', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isOpen: false,
    onClose: mockOnClose,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders all 8 navigation links', () => {
    renderWithRouter(<Sidebar {...defaultProps} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(8);
  });

  it('renders navigation with correct aria-label', () => {
    renderWithRouter(<Sidebar {...defaultProps} />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it('links have correct href attributes', () => {
    renderWithRouter(<Sidebar {...defaultProps} />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /work items/i })).toHaveAttribute(
      'href',
      '/work-items',
    );
    expect(screen.getByRole('link', { name: /budget/i })).toHaveAttribute('href', '/budget');
    expect(screen.getByRole('link', { name: /timeline/i })).toHaveAttribute('href', '/timeline');
    expect(screen.getByRole('link', { name: /household items/i })).toHaveAttribute(
      'href',
      '/household-items',
    );
    expect(screen.getByRole('link', { name: /documents/i })).toHaveAttribute('href', '/documents');
  });

  it('dashboard link is active at exact / path only (end prop)', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/'] });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveClass('active');

    // Other links should not be active
    expect(screen.getByRole('link', { name: /work items/i })).not.toHaveClass('active');
  });

  it('dashboard link is not active on nested routes', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/work-items'] });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).not.toHaveClass('active');
  });

  it('work items link is active at /work-items', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/work-items'] });

    const workItemsLink = screen.getByRole('link', { name: /work items/i });
    expect(workItemsLink).toHaveClass('active');

    // Dashboard should not be active
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  });

  it('budget link is active at /budget', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/budget'] });

    const budgetLink = screen.getByRole('link', { name: /budget/i });
    expect(budgetLink).toHaveClass('active');
  });

  it('timeline link is active at /timeline', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/timeline'] });

    const timelineLink = screen.getByRole('link', { name: /timeline/i });
    expect(timelineLink).toHaveClass('active');
  });

  it('household items link is active at /household-items', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/household-items'] });

    const householdItemsLink = screen.getByRole('link', { name: /household items/i });
    expect(householdItemsLink).toHaveClass('active');
  });

  it('documents link is active at /documents', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/documents'] });

    const documentsLink = screen.getByRole('link', { name: /documents/i });
    expect(documentsLink).toHaveClass('active');
  });

  it('only one link is active at a time', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/budget'] });

    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.classList.contains('active'));
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveTextContent(/budget/i);
  });

  it('renders a close button with correct aria-label', () => {
    renderWithRouter(<Sidebar {...defaultProps} isOpen={true} />);

    const closeButton = screen.getByRole('button', { name: /close menu/i });
    expect(closeButton).toBeInTheDocument();
  });

  it('clicking close button calls onClose', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} isOpen={true} />);

    const closeButton = screen.getByRole('button', { name: /close menu/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('sidebar has .open class when isOpen is true', () => {
    renderWithRouter(<Sidebar {...defaultProps} isOpen={true} />);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toMatch(/open/);
  });

  it('sidebar does not have .open class when isOpen is false', () => {
    renderWithRouter(<Sidebar {...defaultProps} isOpen={false} />);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).not.toMatch(/open/);
  });

  it('clicking a nav link calls onClose (dashboard)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    await user.click(dashboardLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (work items)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const workItemsLink = screen.getByRole('link', { name: /work items/i });
    await user.click(workItemsLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (budget)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const budgetLink = screen.getByRole('link', { name: /budget/i });
    await user.click(budgetLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (timeline)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const timelineLink = screen.getByRole('link', { name: /timeline/i });
    await user.click(timelineLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (household items)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const householdItemsLink = screen.getByRole('link', { name: /household items/i });
    await user.click(householdItemsLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (documents)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const documentsLink = screen.getByRole('link', { name: /documents/i });
    await user.click(documentsLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('user management link has correct href attribute', () => {
    renderWithRouter(<Sidebar {...defaultProps} />);

    expect(screen.getByRole('link', { name: /user management/i })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it('user management link is active at /admin/users', () => {
    renderWithRouter(<Sidebar {...defaultProps} />, { initialEntries: ['/admin/users'] });

    const userManagementLink = screen.getByRole('link', { name: /user management/i });
    expect(userManagementLink).toHaveClass('active');
  });

  it('clicking user management link calls onClose', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar {...defaultProps} />);

    const userManagementLink = screen.getByRole('link', { name: /user management/i });
    await user.click(userManagementLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
