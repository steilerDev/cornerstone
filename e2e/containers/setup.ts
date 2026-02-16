import { Network } from 'testcontainers';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { startOidcContainer } from './oidcContainer.js';
import { startCornerstoneContainer } from './cornerstoneContainer.js';
import { startProxyContainer } from './proxyContainer.js';

export interface ContainerState {
  appBaseUrl: string;
  proxyBaseUrl: string;
  oidcIssuerUrl: string;
  networkId: string;
  cornerstoneContainerId: string;
  oidcContainerId: string;
  proxyContainerId: string;
}

const STATE_FILE_PATH = 'e2e/test-results/.state/containers.json';

/**
 * Playwright global setup function.
 * Creates Docker network and starts all required containers for E2E testing.
 */
export default async function globalSetup(): Promise<void> {
  console.log('🐳 Starting E2E test containers...');

  // Create a Docker network for all containers
  const network = await new Network().start();
  console.log(`✅ Created Docker network: ${network.getName()}`);

  // Start OIDC mock server
  console.log('🔐 Starting OIDC server...');
  const oidc = await startOidcContainer(network);
  console.log(`✅ OIDC server ready at ${oidc.issuerUrl}`);

  // Start Cornerstone application with OIDC configuration
  console.log('🏗️  Starting Cornerstone application...');
  const app = await startCornerstoneContainer({
    network,
    oidcPort: oidc.port,
  });
  console.log(`✅ Cornerstone app ready at ${app.baseUrl}`);

  // Start Nginx reverse proxy with OIDC proxy support
  console.log('🔄 Starting reverse proxy...');
  const proxy = await startProxyContainer(network, oidc.port);
  console.log(`✅ Reverse proxy ready at ${proxy.proxyUrl}`);

  // Prepare state object
  const state: ContainerState = {
    appBaseUrl: app.baseUrl,
    proxyBaseUrl: proxy.proxyUrl,
    oidcIssuerUrl: oidc.issuerUrl,
    networkId: network.getId(),
    cornerstoneContainerId: app.container.getId(),
    oidcContainerId: oidc.container.getId(),
    proxyContainerId: proxy.container.getId(),
  };

  // Write state to file
  await mkdir(dirname(STATE_FILE_PATH), { recursive: true });
  await writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  console.log(`💾 Container state saved to ${STATE_FILE_PATH}`);

  // Set environment variables for Playwright tests
  // IMPORTANT: Use proxy URL as APP_BASE_URL so all tests go through the proxy
  // This ensures OIDC redirects are rewritten to browser-accessible URLs
  process.env.APP_BASE_URL = proxy.proxyUrl;
  process.env.PROXY_BASE_URL = proxy.proxyUrl;
  process.env.OIDC_ISSUER_URL = oidc.issuerUrl;

  console.log('✅ All containers ready for E2E testing');
}
