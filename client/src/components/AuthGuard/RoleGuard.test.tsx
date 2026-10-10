/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { UserRole } from '@cornerstone/shared';
import type * as RoleGuardTypes from './RoleGuard.js';

interface AuthState {
  user: { id: string; role: UserRole } | null;
  isLoading: boolean;
}

let authState: AuthState = { user: null, isLoading: false };

// Must mock BEFORE importing the component
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => authState,
}));

describe('RoleGuard', () => {
  let RoleGuard: typeof RoleGuardTypes.RoleGuard;

  beforeEach(async () => {
    if (!RoleGuard) {
      RoleGuard = (await import('./RoleGuard.js')).RoleGuard;
    }
    authState = { user: null, isLoading: false };
  });

  function renderGuard(allow: readonly UserRole[]) {
    return render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route element={<RoleGuard allow={allow} fallback={<div>fallback</div>} />}>
            <Route path="/x" element={<div>child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders nothing while the session is loading (no child, no fallback)', () => {
    authState = { user: { id: '1', role: 'admin' }, isLoading: true };

    const { container } = renderGuard(['admin']);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('child')).toBeNull();
    expect(screen.queryByText('fallback')).toBeNull();
  });

  it('renders the child route for an allowed admin', () => {
    authState = { user: { id: '1', role: 'admin' }, isLoading: false };

    renderGuard(['admin']);

    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).toBeNull();
  });

  it('renders the fallback in place for a member when only admins are allowed', () => {
    authState = { user: { id: '2', role: 'member' }, isLoading: false };

    renderGuard(['admin']);

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('renders the fallback when there is no user after loading', () => {
    authState = { user: null, isLoading: false };

    renderGuard(['admin']);

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('renders the child for a member when members are allowed too', () => {
    authState = { user: { id: '2', role: 'member' }, isLoading: false };

    renderGuard(['admin', 'member']);

    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).toBeNull();
  });
});
