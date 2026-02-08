import { screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { renderWithRouter } from '../../test/testUtils';

describe('Sidebar', () => {
  it('renders all 6 navigation links', () => {
    renderWithRouter(<Sidebar />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
  });

  it('renders navigation with correct aria-label', () => {
    renderWithRouter(<Sidebar />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it('links have correct href attributes', () => {
    renderWithRouter(<Sidebar />);

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
    renderWithRouter(<Sidebar />, { initialEntries: ['/'] });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveClass('active');

    // Other links should not be active
    expect(screen.getByRole('link', { name: /work items/i })).not.toHaveClass('active');
  });

  it('dashboard link is not active on nested routes', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/work-items'] });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).not.toHaveClass('active');
  });

  it('work items link is active at /work-items', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/work-items'] });

    const workItemsLink = screen.getByRole('link', { name: /work items/i });
    expect(workItemsLink).toHaveClass('active');

    // Dashboard should not be active
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  });

  it('budget link is active at /budget', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/budget'] });

    const budgetLink = screen.getByRole('link', { name: /budget/i });
    expect(budgetLink).toHaveClass('active');
  });

  it('timeline link is active at /timeline', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/timeline'] });

    const timelineLink = screen.getByRole('link', { name: /timeline/i });
    expect(timelineLink).toHaveClass('active');
  });

  it('household items link is active at /household-items', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/household-items'] });

    const householdItemsLink = screen.getByRole('link', { name: /household items/i });
    expect(householdItemsLink).toHaveClass('active');
  });

  it('documents link is active at /documents', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/documents'] });

    const documentsLink = screen.getByRole('link', { name: /documents/i });
    expect(documentsLink).toHaveClass('active');
  });

  it('only one link is active at a time', () => {
    renderWithRouter(<Sidebar />, { initialEntries: ['/budget'] });

    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.classList.contains('active'));
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveTextContent(/budget/i);
  });
});
