import { render, screen } from '@testing-library/react';
import { DocumentsPage } from './DocumentsPage';

describe('DocumentsPage', () => {
  it('renders Documents title', () => {
    render(<DocumentsPage />);

    expect(screen.getByRole('heading', { name: /documents/i })).toBeInTheDocument();
  });

  it('renders descriptive message about accessing documents', () => {
    render(<DocumentsPage />);

    expect(
      screen.getByText(/access and manage project documents.*paperless-ngx/i),
    ).toBeInTheDocument();
  });
});
