import { GenericContainer, Wait } from 'testcontainers';
import type { Network, StartedTestContainer } from 'testcontainers';

export interface StartedProxyContainer {
  container: StartedTestContainer;
  proxyUrl: string;
}

/**
 * Starts an Nginx reverse proxy container for E2E testing.
 * The proxy forwards requests to the Cornerstone app and sets appropriate headers.
 *
 * @param network - Docker network to join
 * @returns Started container and its proxy URL
 */
export async function startProxyContainer(network: Network): Promise<StartedProxyContainer> {
  // Nginx configuration that proxies to the Cornerstone app
  const nginxConfig = `
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://cornerstone-app:3000;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Host $host;
    }
}
`;

  const container = await new GenericContainer('nginx:alpine')
    .withNetwork(network)
    .withNetworkAliases('proxy')
    .withExposedPorts(80)
    .withCopyContentToContainer([
      {
        content: nginxConfig,
        target: '/etc/nginx/conf.d/default.conf',
      },
    ])
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const mappedPort = container.getMappedPort(80);
  const proxyUrl = `http://localhost:${mappedPort}`;

  return {
    container,
    proxyUrl,
  };
}
