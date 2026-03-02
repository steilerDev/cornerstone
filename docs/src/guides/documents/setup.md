---
sidebar_position: 1
title: Setup
---

# Paperless-ngx Setup

To enable the document integration, configure two environment variables and restart Cornerstone.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PAPERLESS_URL` | Yes | Base URL of your Paperless-ngx instance (e.g., `https://paperless.example.com`) |
| `PAPERLESS_API_TOKEN` | Yes | API authentication token from Paperless-ngx |

Both variables must be set for the integration to activate. If either is missing, Cornerstone will show a "Not Configured" message on the Documents page and in the document linking sections.

### Getting Your API Token

1. Log in to your Paperless-ngx instance
2. Navigate to **Settings** (gear icon) or go to `/admin/`
3. Under **Auth Tokens** (or the Django admin interface at `/admin/authtoken/tokenproxy/`), create a new token or copy an existing one
4. The token is a long alphanumeric string -- copy it exactly

### Docker Run

```bash
docker run -d \
  --name cornerstone \
  -p 3000:3000 \
  -v cornerstone-data:/app/data \
  -e PAPERLESS_URL=https://paperless.example.com \
  -e PAPERLESS_API_TOKEN=your-api-token-here \
  steilerdev/cornerstone:latest
```

### Docker Compose

Add the environment variables to your `docker-compose.yml`:

```yaml
services:
  cornerstone:
    image: steilerdev/cornerstone:latest
    ports:
      - '3000:3000'
    volumes:
      - cornerstone-data:/app/data
    environment:
      PAPERLESS_URL: https://paperless.example.com
      PAPERLESS_API_TOKEN: your-api-token-here
```

Or set them in your `.env` file:

```env
PAPERLESS_URL=https://paperless.example.com
PAPERLESS_API_TOKEN=your-api-token-here
```

## Network Requirements

The Cornerstone **server** must be able to reach your Paperless-ngx instance over the network. The browser does not connect to Paperless-ngx directly -- all requests are proxied through the Cornerstone backend.

If both services run on the same Docker network, you can use the container name as the hostname:

```yaml
services:
  cornerstone:
    environment:
      PAPERLESS_URL: http://paperless:8000
      PAPERLESS_API_TOKEN: your-api-token-here
    networks:
      - internal

  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    networks:
      - internal

networks:
  internal:
```

:::caution
`PAPERLESS_URL` must use `http` or `https`. Other URL schemes are rejected for security reasons.
:::

## Verifying the Connection

After configuring the environment variables and restarting Cornerstone:

1. Navigate to the **Documents** page in the sidebar
2. If the connection is successful, you will see your documents from Paperless-ngx
3. If the connection fails, you will see a "Paperless-ngx Unreachable" message with a **Try Again** button

## Troubleshooting

### "Paperless-ngx Not Configured"

This message appears when `PAPERLESS_URL` or `PAPERLESS_API_TOKEN` (or both) are not set. Double-check your environment variables and restart the container.

### "Paperless-ngx Unreachable"

The environment variables are set, but Cornerstone cannot connect to Paperless-ngx. Common causes:

- **Wrong URL** -- Verify the URL is correct and includes the protocol (`http://` or `https://`)
- **Network isolation** -- Ensure the Cornerstone container can reach the Paperless-ngx host (check Docker networks, firewalls, DNS)
- **Invalid token** -- Verify the API token is correct and has not expired
- **Paperless-ngx is down** -- Check that your Paperless-ngx instance is running and accessible

### No documents appear

If the connection is successful but no documents show up:

- Verify that your Paperless-ngx instance has documents ingested
- Check that the API token has read access to the documents
- Try a search query to narrow down results
