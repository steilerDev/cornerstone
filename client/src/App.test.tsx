/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders without crashing', async () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
    // Wait for lazy-loaded component to resolve
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
  });

  it('renders the AppShell layout with sidebar and header', async () => {
    render(<App />);

    // Sidebar should be present
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();

    // Header should be present
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();

    // Main content area should be present
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();

    // Wait for lazy-loaded component to resolve
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
  });

  it('shows Dashboard page at root path /', async () => {
    render(<App />);

    // Wait for lazy-loaded Dashboard component to resolve
    const heading = await screen.findByRole('heading', { name: /dashboard/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Work Items page when /work-items path is accessed', async () => {
    window.history.pushState({}, 'Work Items', '/work-items');
    render(<App />);

    // Wait for lazy-loaded WorkItems component to resolve
    const heading = await screen.findByRole('heading', { name: /work items/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Budget page when /budget path is accessed', async () => {
    window.history.pushState({}, 'Budget', '/budget');
    render(<App />);

    // Wait for lazy-loaded Budget component to resolve
    const heading = await screen.findByRole('heading', { name: /budget/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Timeline page when /timeline path is accessed', async () => {
    window.history.pushState({}, 'Timeline', '/timeline');
    render(<App />);

    // Wait for lazy-loaded Timeline component to resolve
    const heading = await screen.findByRole('heading', { name: /timeline/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Household Items page when /household-items path is accessed', async () => {
    window.history.pushState({}, 'Household Items', '/household-items');
    render(<App />);

    // Wait for lazy-loaded HouseholdItems component to resolve
    const heading = await screen.findByRole('heading', { name: /household items/i });
    expect(heading).toBeInTheDocument();
  });

  it('navigates to Documents page when /documents path is accessed', async () => {
    window.history.pushState({}, 'Documents', '/documents');
    render(<App />);

    // Wait for lazy-loaded Documents component to resolve
    const heading = await screen.findByRole('heading', { name: /documents/i });
    expect(heading).toBeInTheDocument();
  });

  it('shows NotFoundPage for unrecognized routes', async () => {
    window.history.pushState({}, 'Unknown', '/unknown-route');
    render(<App />);

    // Wait for lazy-loaded NotFound component to resolve
    const heading = await screen.findByRole('heading', { name: /404.*not found/i });
    expect(heading).toBeInTheDocument();
  });
});
