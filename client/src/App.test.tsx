import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
  });

  it('renders the AppShell layout with sidebar and header', () => {
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
  });

  it('shows Dashboard page at root path /', () => {
    render(<App />);

    // Dashboard title should be visible
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('navigates to Work Items page when /work-items path is accessed', () => {
    window.history.pushState({}, 'Work Items', '/work-items');
    render(<App />);

    expect(screen.getByRole('heading', { name: /work items/i })).toBeInTheDocument();
  });

  it('navigates to Budget page when /budget path is accessed', () => {
    window.history.pushState({}, 'Budget', '/budget');
    render(<App />);

    expect(screen.getByRole('heading', { name: /budget/i })).toBeInTheDocument();
  });

  it('navigates to Timeline page when /timeline path is accessed', () => {
    window.history.pushState({}, 'Timeline', '/timeline');
    render(<App />);

    expect(screen.getByRole('heading', { name: /timeline/i })).toBeInTheDocument();
  });

  it('navigates to Household Items page when /household-items path is accessed', () => {
    window.history.pushState({}, 'Household Items', '/household-items');
    render(<App />);

    expect(screen.getByRole('heading', { name: /household items/i })).toBeInTheDocument();
  });

  it('navigates to Documents page when /documents path is accessed', () => {
    window.history.pushState({}, 'Documents', '/documents');
    render(<App />);

    expect(screen.getByRole('heading', { name: /documents/i })).toBeInTheDocument();
  });

  it('shows NotFoundPage for unrecognized routes', () => {
    window.history.pushState({}, 'Unknown', '/unknown-route');
    render(<App />);

    expect(screen.getByRole('heading', { name: /404.*not found/i })).toBeInTheDocument();
  });
});
