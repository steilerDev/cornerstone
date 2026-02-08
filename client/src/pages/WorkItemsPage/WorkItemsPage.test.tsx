import { render, screen } from '@testing-library/react';
import { WorkItemsPage } from './WorkItemsPage';

describe('WorkItemsPage', () => {
  it('renders Work Items title', () => {
    render(<WorkItemsPage />);

    expect(screen.getByRole('heading', { name: /work items/i })).toBeInTheDocument();
  });

  it('renders descriptive message about managing work items', () => {
    render(<WorkItemsPage />);

    expect(
      screen.getByText(/manage all construction tasks.*track status, dependencies/i),
    ).toBeInTheDocument();
  });
});
