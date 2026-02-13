/**
 * Infrastructure E2E Tests: Database Migrations
 *
 * Tests that database migrations apply correctly in a fresh container
 * and that the schema supports the full application lifecycle.
 */

import { test, expect } from '@playwright/test';
import { TEST_ADMIN, API } from '../../fixtures/testData.js';

test.describe('Database Migrations', () => {
  test('should have healthy application after migrations', async ({ request }) => {
    // Given: A fresh container with migrations applied
    // When: Checking the health endpoint
    const response = await request.get(API.health);

    // Then: The application should be healthy
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('should support full user lifecycle after migrations', async ({ request }) => {
    // Given: A fresh container with migrations applied
    // When: Logging in as the admin user
    const loginResponse = await request.post(API.login, {
      data: {
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      },
    });

    // Then: Login should succeed
    expect(loginResponse.ok()).toBeTruthy();

    // When: Verifying the session
    const statusResponse = await request.get(API.authStatus);

    // Then: The session should be authenticated
    expect(statusResponse.ok()).toBeTruthy();
    const status = await statusResponse.json();
    expect(status.authenticated).toBeTruthy();
    expect(status.user).toHaveProperty('email', TEST_ADMIN.email);
  });

  test('should handle idempotent startup', async ({ request }) => {
    // Given: A container that has already started and run migrations
    // When: Making multiple health check requests
    const firstCheck = await request.get(API.health);
    const secondCheck = await request.get(API.health);

    // Then: All requests should succeed (migrations don't fail on re-run)
    expect(firstCheck.ok()).toBeTruthy();
    expect(secondCheck.ok()).toBeTruthy();

    const firstBody = await firstCheck.json();
    const secondBody = await secondCheck.json();

    expect(firstBody).toHaveProperty('status', 'ok');
    expect(secondBody).toHaveProperty('status', 'ok');
  });

  test('should support authentication state persistence', async ({ request }) => {
    // Given: A fresh container with migrations applied
    // When: Creating a session via login
    const loginResponse = await request.post(API.login, {
      data: {
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();

    // And: Verifying the session persists across multiple requests
    const firstStatusCheck = await request.get(API.authStatus);
    const secondStatusCheck = await request.get(API.authStatus);

    // Then: Session should persist (sessions table works correctly)
    expect(firstStatusCheck.ok()).toBeTruthy();
    expect(secondStatusCheck.ok()).toBeTruthy();

    const firstStatus = await firstStatusCheck.json();
    const secondStatus = await secondStatusCheck.json();

    expect(firstStatus.authenticated).toBeTruthy();
    expect(secondStatus.authenticated).toBeTruthy();
    expect(firstStatus.user.id).toBe(secondStatus.user.id);
  });

  test('should support logout and session cleanup', async ({ request }) => {
    // Given: An authenticated session
    const loginResponse = await request.post(API.login, {
      data: {
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();

    // Verify authenticated
    const statusBeforeLogout = await request.get(API.authStatus);
    expect(statusBeforeLogout.ok()).toBeTruthy();
    const statusBefore = await statusBeforeLogout.json();
    expect(statusBefore.authenticated).toBeTruthy();

    // When: Logging out
    const logoutResponse = await request.post(API.logout);

    // Then: Logout should succeed
    expect(logoutResponse.ok()).toBeTruthy();

    // And: Session should no longer be authenticated
    const statusAfterLogout = await request.get(API.authStatus);
    expect(statusAfterLogout.ok()).toBeTruthy();
    const statusAfter = await statusAfterLogout.json();
    expect(statusAfter.authenticated).toBeFalsy();
  });
});
