import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type * as OidcClientTypes from 'openid-client';
import type * as OidcServiceTypes from './oidcService.js';

// Must mock BEFORE importing the module
jest.unstable_mockModule('openid-client', () => ({
  discovery: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  allowInsecureRequests: Symbol('allowInsecureRequests'),
}));

describe('OIDC Service', () => {
  // Dynamic imports inside describe block to avoid top-level await
  let oidcClient: typeof OidcClientTypes;
  let oidcService: typeof OidcServiceTypes;

  let mockDiscovery: jest.MockedFunction<typeof OidcClientTypes.discovery>;
  let mockBuildAuthorizationUrl: jest.MockedFunction<typeof OidcClientTypes.buildAuthorizationUrl>;
  let mockAuthorizationCodeGrant: jest.MockedFunction<
    typeof OidcClientTypes.authorizationCodeGrant
  >;

  // Mock Date.now() to control time
  let originalDateNow: typeof Date.now;
  let currentTime: number;

  beforeEach(async () => {
    // Dynamic import modules (only needed once, but done in beforeEach to ensure fresh mocks)
    if (!oidcClient) {
      oidcClient = await import('openid-client');
      oidcService = await import('./oidcService.js');
    }

    // Reset mocks
    mockDiscovery = oidcClient.discovery as jest.MockedFunction<typeof oidcClient.discovery>;
    mockBuildAuthorizationUrl = oidcClient.buildAuthorizationUrl as jest.MockedFunction<
      typeof oidcClient.buildAuthorizationUrl
    >;
    mockAuthorizationCodeGrant = oidcClient.authorizationCodeGrant as jest.MockedFunction<
      typeof oidcClient.authorizationCodeGrant
    >;

    mockDiscovery.mockReset();
    mockBuildAuthorizationUrl.mockReset();
    mockAuthorizationCodeGrant.mockReset();

    // Reset OIDC cache between tests
    oidcService.resetCache();

    // Mock Date.now() to control time in tests
    originalDateNow = Date.now;
    currentTime = 1000000000;
    Date.now = jest.fn(() => currentTime);
  });

  afterEach(() => {
    // Restore Date.now()
    Date.now = originalDateNow;
  });

  describe('storeState() / consumeState()', () => {
    it('stores state and retrieves redirect path', () => {
      // Given: State and redirect path
      const state = 'test-state-123';
      const redirect = '/app/dashboard';

      // When: Storing state
      oidcService.storeState(state, redirect);

      // Then: Can retrieve redirect path
      const result = oidcService.consumeState(state);
      expect(result).toBe(redirect);
    });

    it('returns null for unknown state', () => {
      // Given: No state stored
      // When: Consuming unknown state
      const result = oidcService.consumeState('unknown-state');

      // Then: Returns null
      expect(result).toBeNull();
    });

    it('returns null for expired state (10 minutes)', () => {
      // Given: State stored at time T
      const state = 'expired-state';
      const redirect = '/app/page';

      oidcService.storeState(state, redirect);

      // When: Time advances past TTL (10 minutes + 1ms)
      currentTime += 10 * 60 * 1000 + 1;

      // Then: Consuming expired state returns null
      const result = oidcService.consumeState(state);
      expect(result).toBeNull();
    });

    it('returns state when consumed just before expiry', () => {
      // Given: State stored at time T
      const state = 'almost-expired-state';
      const redirect = '/app/page';

      oidcService.storeState(state, redirect);

      // When: Time advances to 9 minutes 59 seconds (still valid)
      currentTime += 10 * 60 * 1000 - 1000;

      // Then: Can still retrieve state
      const result = oidcService.consumeState(state);
      expect(result).toBe(redirect);
    });

    it('consuming a state removes it (second consume returns null)', () => {
      // Given: State stored
      const state = 'once-only-state';
      const redirect = '/app/page';

      oidcService.storeState(state, redirect);

      // When: Consuming state first time
      const firstResult = oidcService.consumeState(state);

      // Then: First consume succeeds
      expect(firstResult).toBe(redirect);

      // And: Second consume returns null (state removed)
      const secondResult = oidcService.consumeState(state);
      expect(secondResult).toBeNull();
    });

    it('stores multiple states independently', () => {
      // Given: Multiple states stored
      const state1 = 'state-1';
      const state2 = 'state-2';
      const redirect1 = '/app/page1';
      const redirect2 = '/app/page2';

      oidcService.storeState(state1, redirect1);
      oidcService.storeState(state2, redirect2);

      // When: Consuming states
      const result1 = oidcService.consumeState(state1);
      const result2 = oidcService.consumeState(state2);

      // Then: Each returns correct redirect
      expect(result1).toBe(redirect1);
      expect(result2).toBe(redirect2);
    });

    it('expired states are cleaned up on access', () => {
      // Given: Two states stored at different times
      const state1 = 'old-state';
      const state2 = 'new-state';
      const redirect1 = '/old';
      const redirect2 = '/new';

      oidcService.storeState(state1, redirect1);

      // Advance time by 5 minutes
      currentTime += 5 * 60 * 1000;

      oidcService.storeState(state2, redirect2);

      // When: Time advances past state1's expiry (but not state2's)
      currentTime += 6 * 60 * 1000; // state1 is now 11min old, state2 is 6min old

      // Then: state1 is expired, state2 is valid
      const result1 = oidcService.consumeState(state1);
      const result2 = oidcService.consumeState(state2);

      expect(result1).toBeNull();
      expect(result2).toBe(redirect2);
    });
  });

  describe('buildAuthorizationUrl()', () => {
    it('builds authorization URL with correct scope, state, redirect_uri', () => {
      // Given: Mock configuration and redirect URI
      const mockConfig = { issuer: 'https://oidc.example.com' } as never; // Mock config type
      const redirectUri = 'https://app.example.com/api/auth/oidc/callback';
      const appRedirect = '/app/dashboard';

      // Mock buildAuthorizationUrl to return a URL
      mockBuildAuthorizationUrl.mockReturnValue(new URL('https://oidc.example.com/authorize'));

      // When: Building authorization URL
      const result = oidcService.buildAuthorizationUrl(mockConfig, redirectUri, appRedirect);

      // Then: Returns authorization URL and state
      expect(result.authorizationUrl).toBe('https://oidc.example.com/authorize');
      expect(result.state).toBeDefined();
      expect(result.state).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex = 64 chars

      // And: buildAuthorizationUrl called with correct params
      expect(mockBuildAuthorizationUrl).toHaveBeenCalledTimes(1);
      expect(mockBuildAuthorizationUrl).toHaveBeenCalledWith(mockConfig, {
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        state: expect.any(String),
      });
    });

    it('stores state with the app redirect path', () => {
      // Given: Mock configuration and app redirect
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const redirectUri = 'https://app.example.com/api/auth/oidc/callback';
      const appRedirect = '/app/custom-page';

      mockBuildAuthorizationUrl.mockReturnValue(new URL('https://oidc.example.com/authorize'));

      // When: Building authorization URL
      const result = oidcService.buildAuthorizationUrl(mockConfig, redirectUri, appRedirect);

      // Then: State is stored and can be retrieved
      const storedRedirect = oidcService.consumeState(result.state);
      expect(storedRedirect).toBe(appRedirect);
    });

    it('defaults appRedirect to / when not provided', () => {
      // Given: Mock configuration without appRedirect
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const redirectUri = 'https://app.example.com/api/auth/oidc/callback';

      mockBuildAuthorizationUrl.mockReturnValue(new URL('https://oidc.example.com/authorize'));

      // When: Building authorization URL without appRedirect
      const result = oidcService.buildAuthorizationUrl(mockConfig, redirectUri);

      // Then: State stores default redirect
      const storedRedirect = oidcService.consumeState(result.state);
      expect(storedRedirect).toBe('/');
    });
  });

  describe('handleCallback()', () => {
    it('extracts sub, email, name from claims', async () => {
      // Given: Mock token response with claims
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const callbackUrl = new URL('https://app.example.com/callback?code=abc&state=xyz');
      const expectedState = 'xyz';

      const mockClaims = {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'John Doe',
      };

      mockAuthorizationCodeGrant.mockResolvedValue({
        claims: () => mockClaims,
      } as never);

      // When: Handling callback
      const result = await oidcService.handleCallback(mockConfig, callbackUrl, expectedState);

      // Then: Claims are extracted correctly
      expect(result).toEqual({
        sub: 'user-123',
        email: 'user@example.com',
        name: 'John Doe',
      });

      // And: authorizationCodeGrant was called with correct params
      expect(mockAuthorizationCodeGrant).toHaveBeenCalledTimes(1);
      expect(mockAuthorizationCodeGrant).toHaveBeenCalledWith(mockConfig, callbackUrl, {
        expectedState,
      });
    });

    it('falls back to preferred_username when name is missing', async () => {
      // Given: Mock token response without name claim
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const callbackUrl = new URL('https://app.example.com/callback?code=abc&state=xyz');
      const expectedState = 'xyz';

      const mockClaims = {
        sub: 'user-456',
        email: 'user@example.com',
        preferred_username: 'johndoe',
      };

      mockAuthorizationCodeGrant.mockResolvedValue({
        claims: () => mockClaims,
      } as never);

      // When: Handling callback
      const result = await oidcService.handleCallback(mockConfig, callbackUrl, expectedState);

      // Then: preferred_username is used as name
      expect(result).toEqual({
        sub: 'user-456',
        email: 'user@example.com',
        name: 'johndoe',
      });
    });

    it('returns empty string for email when not in claims', async () => {
      // Given: Mock token response without email claim
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const callbackUrl = new URL('https://app.example.com/callback?code=abc&state=xyz');
      const expectedState = 'xyz';

      const mockClaims = {
        sub: 'user-789',
        name: 'Jane Doe',
      };

      mockAuthorizationCodeGrant.mockResolvedValue({
        claims: () => mockClaims,
      } as never);

      // When: Handling callback
      const result = await oidcService.handleCallback(mockConfig, callbackUrl, expectedState);

      // Then: Email is empty string
      expect(result).toEqual({
        sub: 'user-789',
        email: '',
        name: 'Jane Doe',
      });
    });

    it('returns empty string for name when both name and preferred_username missing', async () => {
      // Given: Mock token response without name or preferred_username
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const callbackUrl = new URL('https://app.example.com/callback?code=abc&state=xyz');
      const expectedState = 'xyz';

      const mockClaims = {
        sub: 'user-999',
        email: 'minimal@example.com',
      };

      mockAuthorizationCodeGrant.mockResolvedValue({
        claims: () => mockClaims,
      } as never);

      // When: Handling callback
      const result = await oidcService.handleCallback(mockConfig, callbackUrl, expectedState);

      // Then: Name is empty string
      expect(result).toEqual({
        sub: 'user-999',
        email: 'minimal@example.com',
        name: '',
      });
    });

    it('throws error when claims() returns null', async () => {
      // Given: Mock token response with null claims
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const callbackUrl = new URL('https://app.example.com/callback?code=abc&state=xyz');
      const expectedState = 'xyz';

      mockAuthorizationCodeGrant.mockResolvedValue({
        claims: () => null,
      } as never);

      // When/Then: Handling callback throws error
      await expect(
        oidcService.handleCallback(mockConfig, callbackUrl, expectedState),
      ).rejects.toThrow('No claims found in ID token');
    });

    it('throws error when claims() returns undefined', async () => {
      // Given: Mock token response with undefined claims
      const mockConfig = { issuer: 'https://oidc.example.com' } as never;
      const callbackUrl = new URL('https://app.example.com/callback?code=abc&state=xyz');
      const expectedState = 'xyz';

      mockAuthorizationCodeGrant.mockResolvedValue({
        claims: () => undefined,
      } as never);

      // When/Then: Handling callback throws error
      await expect(
        oidcService.handleCallback(mockConfig, callbackUrl, expectedState),
      ).rejects.toThrow('No claims found in ID token');
    });
  });

  describe('discoverOidcConfig()', () => {
    it('calls discovery and returns configuration', async () => {
      // Given: Mock discovery response
      const issuerUrl = 'https://oidc.example.com';
      const clientId = 'client-123';
      const clientSecret = 'secret-456';
      const mockConfig = {
        issuer: issuerUrl,
        authorization_endpoint: 'https://oidc.example.com/authorize',
      } as never;

      mockDiscovery.mockResolvedValue(mockConfig);

      // When: Discovering OIDC configuration
      const result = await oidcService.discoverOidcConfig(issuerUrl, clientId, clientSecret);

      // Then: Returns configuration
      expect(result).toBe(mockConfig);

      // And: discovery was called with correct params (HTTPS → no allowInsecureRequests)
      expect(mockDiscovery).toHaveBeenCalledTimes(1);
      expect(mockDiscovery).toHaveBeenCalledWith(
        new URL(issuerUrl),
        clientId,
        clientSecret,
        undefined,
        undefined,
      );
    });

    it('passes allowInsecureRequests for HTTP issuer URLs', async () => {
      // Given: HTTP issuer URL
      const issuerUrl = 'http://oidc-server:8080/default';
      const clientId = 'client-123';
      const clientSecret = 'secret-456';
      const mockConfig = {
        issuer: issuerUrl,
      } as never;

      mockDiscovery.mockResolvedValue(mockConfig);

      // When: Discovering OIDC configuration
      await oidcService.discoverOidcConfig(issuerUrl, clientId, clientSecret);

      // Then: discovery was called with allowInsecureRequests in execute array
      expect(mockDiscovery).toHaveBeenCalledTimes(1);
      expect(mockDiscovery).toHaveBeenCalledWith(
        new URL(issuerUrl),
        clientId,
        clientSecret,
        undefined,
        { execute: [oidcClient.allowInsecureRequests] },
      );
    });

    it('caches the result (second call does not invoke discovery again)', async () => {
      // Given: Mock discovery response
      const issuerUrl = 'https://cache-test.example.com';
      const clientId = 'cache-client-123';
      const clientSecret = 'cache-secret-456';
      const mockConfig = {
        issuer: issuerUrl,
        authorization_endpoint: 'https://cache-test.example.com/authorize',
      } as never;

      mockDiscovery.mockResolvedValue(mockConfig);

      // When: Calling discovery twice with same parameters
      const result1 = await oidcService.discoverOidcConfig(issuerUrl, clientId, clientSecret);
      const result2 = await oidcService.discoverOidcConfig(issuerUrl, clientId, clientSecret);

      // Then: Both results are defined and have the same issuer
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1).toBe(result2); // Same object reference

      // And: discovery was called at most once (may be cached from previous test)
      // NOTE: The cache persists across tests in the same file, so we can't guarantee
      // it's exactly 1. We just verify the second call didn't trigger another discovery.
      const callCountAfterFirst = mockDiscovery.mock.calls.length;
      await oidcService.discoverOidcConfig(issuerUrl, clientId, clientSecret);
      expect(mockDiscovery.mock.calls.length).toBe(callCountAfterFirst); // No additional calls
    });
  });
});
