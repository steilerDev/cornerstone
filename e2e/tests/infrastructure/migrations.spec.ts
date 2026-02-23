/**
 * Infrastructure E2E Tests: Database Migrations
 *
 * Tests that database migrations apply correctly in a fresh container
 * and that the schema supports the full application lifecycle.
 */

import { test, expect } from '@playwright/test';
import { TEST_ADMIN, API } from '../../fixtures/testData.js';

test.describe('Database Migrations', () => {
  test(
    'should have healthy application after migrations',
    { tag: '@smoke' },
    async ({ request }) => {
      // Given: A fresh container with migrations applied
      // When: Checking the health endpoint
      const response = await request.get(API.health);

      // Then: The application should be healthy
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body).toHaveProperty('status', 'ok');
    },
  );

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
    const meResponse = await request.get(API.authMe);

    // Then: The session should be authenticated with the correct user
    expect(meResponse.ok()).toBeTruthy();
    const meBody = await meResponse.json();
    expect(meBody.user).toBeTruthy();
    expect(meBody.user).toHaveProperty('email', TEST_ADMIN.email);
    expect(meBody).toHaveProperty('setupRequired', false);
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
    const firstMeCheck = await request.get(API.authMe);
    const secondMeCheck = await request.get(API.authMe);

    // Then: Session should persist (sessions table works correctly)
    expect(firstMeCheck.ok()).toBeTruthy();
    expect(secondMeCheck.ok()).toBeTruthy();

    const firstMe = await firstMeCheck.json();
    const secondMe = await secondMeCheck.json();

    expect(firstMe.user).toBeTruthy();
    expect(secondMe.user).toBeTruthy();
    expect(firstMe.user.id).toBe(secondMe.user.id);
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
    const meBeforeLogout = await request.get(API.authMe);
    expect(meBeforeLogout.ok()).toBeTruthy();
    const meBefore = await meBeforeLogout.json();
    expect(meBefore.user).toBeTruthy();

    // When: Logging out
    const logoutResponse = await request.post(API.logout);

    // Then: Logout should succeed
    expect(logoutResponse.ok()).toBeTruthy();

    // And: Session should no longer be authenticated
    const meAfterLogout = await request.get(API.authMe);
    expect(meAfterLogout.ok()).toBeTruthy();
    const meAfter = await meAfterLogout.json();
    expect(meAfter.user).toBeNull();
  });
});
