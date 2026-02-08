import { render, screen } from '@testing-library/react';
import { HouseholdItemsPage } from './HouseholdItemsPage';

describe('HouseholdItemsPage', () => {
  it('renders Household Items title', () => {
    render(<HouseholdItemsPage />);

    expect(screen.getByRole('heading', { name: /household items/i })).toBeInTheDocument();
  });

  it('renders descriptive message about tracking household items', () => {
    render(<HouseholdItemsPage />);

    expect(
      screen.getByText(/track household items.*furnishings.*delivery dates/i),
    ).toBeInTheDocument();
  });
});
