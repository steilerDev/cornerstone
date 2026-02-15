import { GenericContainer, Wait } from 'testcontainers';
import type { Network, StartedTestContainer } from 'testcontainers';

export interface CornerstoneContainerConfig {
  network: Network;
  oidcPort?: number;
}

export interface StartedCornerstoneContainer {
  container: StartedTestContainer;
  baseUrl: string;
}

/**
 * Starts a Cornerstone application container for E2E testing.
 * The container must be pre-built using `bash scripts/docker-build.sh cornerstone:e2e`
 *
 * @param config - Configuration including Docker network and optional OIDC port
 * @returns Started container and its base URL
 */
export async function startCornerstoneContainer(
  config: CornerstoneContainerConfig,
): Promise<StartedCornerstoneContainer> {
  const { network, oidcPort } = config;

  // Base environment variables
  const environment = {
    DATABASE_URL: '/app/data/cornerstone.db',
    SECURE_COOKIES: 'false',
    LOG_LEVEL: 'debug',
    NODE_ENV: 'production',
    TRUST_PROXY: 'true', // Enable proxy trust for X-Forwarded-* headers
  };

  // Add OIDC configuration if port is provided
  // Uses Docker network alias so the server can reach the OIDC provider container-to-container
  // OIDC_REDIRECT_URI is omitted — the server derives it from the incoming request
  if (oidcPort) {
    Object.assign(environment, {
      OIDC_ISSUER: 'http://oidc-server:8080/default',
      OIDC_CLIENT_ID: 'cornerstone-e2e',
      OIDC_CLIENT_SECRET: 'e2e-secret',
    });
  }

  // Handle proxy configuration for npm access inside container if needed
  const caPath = '/usr/local/share/ca-certificates/proxy-ca.crt';
  const httpProxy = process.env.HTTP_PROXY;
  const httpsProxy = process.env.HTTPS_PROXY;

  let containerBuilder = new GenericContainer('cornerstone:e2e')
    .withNetwork(network)
    .withNetworkAliases('cornerstone-app')
    .withExposedPorts(3000)
    .withEnvironment(environment)
    .withWaitStrategy(Wait.forHttp('/api/health', 3000).forStatusCode(200));

  // Add proxy configuration if available
  if (httpProxy || httpsProxy) {
    containerBuilder = containerBuilder
      .withEnvironment({
        HTTP_PROXY: httpProxy || '',
        HTTPS_PROXY: httpsProxy || '',
        NODE_EXTRA_CA_CERTS: '/tmp/proxy-ca.crt',
      })
      .withCopyFileToContainer(caPath, '/tmp/proxy-ca.crt');
  }

  const container = await containerBuilder.start();

  const mappedPort = container.getMappedPort(3000);
  const baseUrl = `http://localhost:${mappedPort}`;

  return {
    container,
    baseUrl,
  };
}
