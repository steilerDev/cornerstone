import { render, screen } from '@testing-library/react';
import { BudgetPage } from './BudgetPage';

describe('BudgetPage', () => {
  it('renders Budget title', () => {
    render(<BudgetPage />);

    expect(screen.getByRole('heading', { name: /budget/i })).toBeInTheDocument();
  });

  it('renders descriptive message about tracking budget', () => {
    render(<BudgetPage />);

    expect(
      screen.getByText(/track your project budget.*expenses.*financial sources/i),
    ).toBeInTheDocument();
  });
});
