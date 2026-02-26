import { render, screen } from '@testing-library/react';
import { TimelinePage } from './TimelinePage';

describe('TimelinePage', () => {
  it('renders Timeline title', () => {
    render(<TimelinePage />);

    expect(screen.getByRole('heading', { name: /timeline/i })).toBeInTheDocument();
  });

  it('renders descriptive message about Gantt chart', () => {
    render(<TimelinePage />);

    expect(
      screen.getByText(/view your project timeline.*gantt chart.*dependencies/i),
    ).toBeInTheDocument();
  });
});
