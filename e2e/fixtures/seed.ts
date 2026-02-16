/**
 * API-based seeding utilities for E2E tests
 */

import type { APIRequestContext } from '@playwright/test';

interface LoginResponse {
  success: boolean;
}

interface SetupResponse {
  user: {
    id: number;
    email: string;
    displayName: string;
    role: string;
  };
}

/**
 * Create the initial admin user via the setup endpoint
 */
export async function seedAdminUser(
  request: APIRequestContext,
  baseUrl: string,
  email: string,
  displayName: string,
  password: string,
): Promise<SetupResponse> {
  const response = await request.post(`${baseUrl}/api/auth/setup`, {
    data: { email, displayName, password },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create admin user: ${response.status()} ${response.statusText()}`);
  }

  return (await response.json()) as SetupResponse;
}

/**
 * Login as a user and return the session cookies
 */
export async function loginAsUser(
  request: APIRequestContext,
  baseUrl: string,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Failed to login: ${response.status()} ${response.statusText()}`);
  }

  return (await response.json()) as LoginResponse;
}
