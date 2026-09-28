# Release Summary

## What's New

Paperless-ngx integration is now compatible with current server releases (API version 10). Previous versions targeted an outdated API endpoint, causing HTTP 406 errors. This patch restores Paperless document browsing and linking, adds proper tag color display, and handles modern date formats.

### Highlights

- **Paperless-ngx compatibility restored** -- API version 10 support eliminates HTTP 406 errors on current Paperless-ngx servers
- **Tag colors now display** -- Tag colors from Paperless-ngx are correctly mapped from the hex color field
- **Modern server support** -- Handles current Paperless-ngx servers' date-only created dates and numeric search scores
- **Clear error messages** -- If your server doesn't support API v10, Cornerstone shows a clear error message

## Upgrade

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run automatically on first boot.
