import { GenericContainer, Wait } from 'testcontainers';
import type { Network, StartedTestContainer } from 'testcontainers';

export interface StartedProxyContainer {
  container: StartedTestContainer;
  proxyUrl: string;
}

/**
 * Starts an Nginx reverse proxy container for E2E testing.
 * The proxy forwards requests to the Cornerstone app and sets appropriate headers.
 * It also proxies OIDC requests and rewrites OIDC redirects to be browser-accessible.
 *
 * @param network - Docker network to join
 * @param oidcPort - The host-mapped port for the OIDC server (used for rewriting redirects)
 * @returns Started container and its proxy URL
 */
export async function startProxyContainer(
  network: Network,
  _oidcPort: number,
): Promise<StartedProxyContainer> {
  // NOTE: oidcPort is received but not used in the nginx config because the proxy
  // communicates with the OIDC server via Docker network alias (oidc-server:8080).
  // The parameter is kept for API consistency and future extensibility.

  // Nginx configuration that proxies to the Cornerstone app and OIDC server
  const nginxConfig = `
server {
    listen 80;
    server_name _;

    # Main application proxy
    location / {
        proxy_pass http://cornerstone-app:3000;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Use $http_host (not $host) to preserve the port number.
        # $host strips the port, which breaks redirect_uri construction.
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header Host $http_host;

        # Rewrite OIDC redirects from Docker network alias to browser-accessible URL.
        # The Cornerstone server redirects to http://oidc-server:8080/... (Docker alias)
        # which the browser cannot resolve. Rewrite to an absolute URL using $http_host
        # so the browser reaches the OIDC server through this proxy's /oidc-proxy/ path.
        # Must use a full URL (not relative path) because server_name is '_' (wildcard).
        proxy_redirect ~*^http://oidc-server:8080/(.*)$ http://$http_host/oidc-proxy/$1;
    }

    # OIDC server proxy (browser-accessible endpoint)
    location /oidc-proxy/ {
        # Strip /oidc-proxy/ prefix and forward to OIDC server
        rewrite ^/oidc-proxy/(.*)$ /$1 break;
        proxy_pass http://oidc-server:8080;

        # IMPORTANT: Set Host to oidc-server:8080 so the OIDC server's response URLs
        # use the Docker alias. This is critical for server-to-server token exchange.
        proxy_set_header Host oidc-server:8080;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
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
