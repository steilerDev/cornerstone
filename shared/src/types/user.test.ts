import { describe, it, expect } from '@jest/globals';
import type { User, UserResponse, UserRole, AuthProvider } from './user.js';

describe('User types', () => {
  describe('User interface', () => {
    it('should define correct User shape with all required fields', () => {
      const user: User = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deactivatedAt: null,
      };

      expect(user.id).toBe('123');
      expect(user.email).toBe('test@example.com');
      expect(user.displayName).toBe('Test User');
      expect(user.role).toBe('admin');
      expect(user.authProvider).toBe('local');
      expect(user.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(user.updatedAt).toBe('2024-01-01T00:00:00Z');
      expect(user.deactivatedAt).toBeNull();
    });

    it('should allow deactivatedAt to be null', () => {
      const user: User = {
        id: '456',
        email: 'active@example.com',
        displayName: 'Active User',
        role: 'member',
        authProvider: 'oidc',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        deactivatedAt: null,
      };

      expect(user.deactivatedAt).toBeNull();
    });

    it('should allow deactivatedAt to be a string timestamp', () => {
      const user: User = {
        id: '789',
        email: 'deactivated@example.com',
        displayName: 'Deactivated User',
        role: 'member',
        authProvider: 'oidc',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
        deactivatedAt: '2024-06-01T00:00:00Z',
      };

      expect(user.deactivatedAt).toBe('2024-06-01T00:00:00Z');
    });

    it('should support admin role', () => {
      const user: User = {
        id: '101',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deactivatedAt: null,
      };

      expect(user.role).toBe('admin');
    });

    it('should support member role', () => {
      const user: User = {
        id: '102',
        email: 'member@example.com',
        displayName: 'Member',
        role: 'member',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deactivatedAt: null,
      };

      expect(user.role).toBe('member');
    });

    it('should support local auth provider', () => {
      const user: User = {
        id: '201',
        email: 'local@example.com',
        displayName: 'Local User',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deactivatedAt: null,
      };

      expect(user.authProvider).toBe('local');
    });

    it('should support oidc auth provider', () => {
      const user: User = {
        id: '202',
        email: 'oidc@example.com',
        displayName: 'OIDC User',
        role: 'member',
        authProvider: 'oidc',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deactivatedAt: null,
      };

      expect(user.authProvider).toBe('oidc');
    });
  });

  describe('UserResponse interface', () => {
    it('should define correct UserResponse shape with required fields', () => {
      const response: UserResponse = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
      };

      expect(response.id).toBe('123');
      expect(response.email).toBe('test@example.com');
      expect(response.displayName).toBe('Test User');
      expect(response.role).toBe('admin');
      expect(response.authProvider).toBe('local');
      expect(response.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should allow optional updatedAt field', () => {
      const response: UserResponse = {
        id: '456',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'oidc',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      expect(response.updatedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('should allow optional deactivatedAt field', () => {
      const response: UserResponse = {
        id: '789',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
        deactivatedAt: '2024-06-01T00:00:00Z',
      };

      expect(response.deactivatedAt).toBe('2024-06-01T00:00:00Z');
    });

    it('should allow deactivatedAt to be null', () => {
      const response: UserResponse = {
        id: '999',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00Z',
        deactivatedAt: null,
      };

      expect(response.deactivatedAt).toBeNull();
    });

    it('should work with minimal required fields only', () => {
      const response: UserResponse = {
        id: '111',
        email: 'minimal@example.com',
        displayName: 'Minimal User',
        role: 'member',
        authProvider: 'oidc',
        createdAt: '2024-01-01T00:00:00Z',
      };

      expect(response.updatedAt).toBeUndefined();
      expect(response.deactivatedAt).toBeUndefined();
    });
  });

  describe('UserRole type', () => {
    it('should accept admin role', () => {
      const role: UserRole = 'admin';
      expect(role).toBe('admin');
    });

    it('should accept member role', () => {
      const role: UserRole = 'member';
      expect(role).toBe('member');
    });
  });

  describe('AuthProvider type', () => {
    it('should accept local provider', () => {
      const provider: AuthProvider = 'local';
      expect(provider).toBe('local');
    });

    it('should accept oidc provider', () => {
      const provider: AuthProvider = 'oidc';
      expect(provider).toBe('oidc');
    });
  });
});
