import { describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { AreaLink } from './AreaLink.js';
import type { AreaLinkProps } from './AreaLink.js';

function renderLink(props: Partial<AreaLinkProps> = {}, initial = '/photos?view=spots') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AreaLink areaId="a1" {...props}>
        Garden › Shed
      </AreaLink>
      <OriginProbe />
    </MemoryRouter>,
  );
}

describe('AreaLink', () => {
  it('links to the Areas index (interim until the area page is served)', () => {
    renderLink();
    expect(screen.getByRole('link')).toHaveAttribute('href', routeUrl('areas'));
  });

  it('a string name gets one exact accessible name and no hidden span', () => {
    renderLink();
    const link = screen.getByRole('link', { name: 'Garden › Shed, open in Areas' });
    expect(link).toHaveAttribute('aria-label', 'Garden › Shed, open in Areas');
    expect(link).toHaveTextContent(/^Garden › Shed$/);
    expect(link.querySelector('span')).toBeNull();
  });

  it('non-string children keep the visible content and a hidden suffix span', () => {
    render(
      <MemoryRouter>
        <AreaLink areaId="a2">
          <em>Shed</em>
        </AreaLink>
      </MemoryRouter>,
    );
    const link = screen.getByTestId('area-link-a2');
    expect(link).not.toHaveAttribute('aria-label');
    expect(link).toHaveTextContent('Shed, open in Areas');
    expect(screen.getByText(', open in Areas').className).toMatch(/srOnly/);
  });

  it('carries the current page as origin so Back returns to it', () => {
    renderLink();
    fireEvent.click(screen.getByRole('link'));
    expect(probedPath()).toBe(routeUrl('areas'));
    expect(probedOrigin()?.to).toBe('/photos?view=spots');
  });

  it('uses the default test id built from the area id', () => {
    renderLink();
    expect(screen.getByTestId('area-link-a1')).toBe(screen.getByRole('link'));
  });

  it('uses a custom test id', () => {
    renderLink({ testId: 'my-link' });
    expect(screen.getByTestId('my-link')).toBeInTheDocument();
    expect(screen.queryByTestId('area-link-a1')).not.toBeInTheDocument();
  });

  it('applies the onPhoto tone class only for tone="onPhoto"', () => {
    const { unmount } = renderLink();
    expect(screen.getByRole('link').className).not.toMatch(/onPhoto/);
    unmount();

    renderLink({ tone: 'onPhoto' });
    expect(screen.getByRole('link').className).toMatch(/onPhoto/);
  });

  it('adds the host class name', () => {
    renderLink({ className: 'host-layout' });
    expect(screen.getByRole('link').className).toMatch(/host-layout/);
  });
});
