/**
 * E2E tests for OIDC SSO flow (Stories #34, #35)
 *
 * SKIPPED: OIDC container networking requires a separate fix.
 * The OIDC issuer URL (localhost:mappedPort) is unreachable from inside the
 * Cornerstone container, and the redirect URI cannot be patched after container
 * start. These tests need a shared Docker network with proper service discovery.
 */

import { test } from '@playwright/test';

test.describe('OIDC SSO Flow', () => {
  test.skip(
    true,
    'OIDC container networking requires separate fix — issuer URL unreachable from inside container',
  );

  // Clear auth state for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Login page shows SSO button when OIDC enabled', async () => {
    // Placeholder — see skip annotation above
  });

  test('SSO button triggers redirect to OIDC provider', async () => {
    // Placeholder — see skip annotation above
  });

  test('Full OIDC flow creates session', async () => {
    // Placeholder — see skip annotation above
  });

  test('New OIDC user is auto-provisioned', async () => {
    // Placeholder — see skip annotation above
  });

  test('OIDC user appears in user management', async () => {
    // Placeholder — see skip annotation above
  });
});
