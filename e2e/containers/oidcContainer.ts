import { GenericContainer, Wait } from 'testcontainers';
import type { Network, StartedTestContainer } from 'testcontainers';

export interface StartedOidcContainer {
  container: StartedTestContainer;
  issuerUrl: string;
  port: number;
}

/**
 * Starts a mock OIDC provider container for E2E testing.
 * Uses navikt/mock-oauth2-server for simulating OIDC authentication.
 *
 * @param network - Docker network to join
 * @returns Started container, issuer URL, and mapped port
 */
export async function startOidcContainer(network: Network): Promise<StartedOidcContainer> {
  // Mock OIDC server configuration
  const jsonConfig = JSON.stringify({
    interactiveLogin: true,
    httpServer: 'NettyWrapper',
    tokenCallbacks: [
      {
        issuerId: 'default',
        tokenExpiry: 3600,
        requestMappings: [
          {
            requestParam: 'grant_type',
            match: 'authorization_code',
            claims: {
              sub: 'e2e-test-user',
              email: 'e2e@test.local',
              email_verified: true,
              name: 'E2E Test User',
            },
          },
        ],
      },
    ],
  });

  const container = await new GenericContainer('ghcr.io/navikt/mock-oauth2-server:latest')
    .withNetwork(network)
    .withNetworkAliases('oidc-server')
    .withExposedPorts(8080)
    .withEnvironment({
      JSON_CONFIG: jsonConfig,
    })
    .withWaitStrategy(Wait.forHttp('/.well-known/openid-configuration', 8080).forStatusCode(200))
    .start();

  const mappedPort = container.getMappedPort(8080);
  const issuerUrl = `http://localhost:${mappedPort}/default`;

  return {
    container,
    issuerUrl,
    port: mappedPort,
  };
}
