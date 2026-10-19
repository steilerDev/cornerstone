/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { FeedGroup } from './FeedGroup.js';

describe('FeedGroup', () => {
  it('renders a labelled section with an h2 and a list of the rows', () => {
    render(
      <FeedGroup heading="This week" testId="group-1">
        <li>Row A</li>
        <li>Row B</li>
      </FeedGroup>,
    );
    const section = screen.getByTestId('group-1');
    const heading = screen.getByRole('heading', { level: 2, name: 'This week' });
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('aria-labelledby', heading.id);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the muted detail and the screen-reader suffix inside the heading name', () => {
    render(
      <FeedGroup
        heading="Week of Oct 12"
        headingDetail="October 12 – 18, 2026"
        srSuffix=", 4 entries"
        testId="group-1"
      >
        <li>Row A</li>
      </FeedGroup>,
    );
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Week of Oct 12 October 12 – 18, 2026, 4 entries');
    expect(screen.getByText('October 12 – 18, 2026')).toBeInTheDocument();
  });

  it('omits the detail and suffix when not given', () => {
    render(
      <FeedGroup heading="Today" testId="group-1">
        <li>Row A</li>
      </FeedGroup>,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Today');
  });
});
