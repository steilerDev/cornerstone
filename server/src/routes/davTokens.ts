import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { UnauthorizedError } from '../errors/AppError.js';
import * as davTokenService from '../services/davTokenService.js';

/**
 * Convert a UUID string to the standard UUID format: 8-4-4-4-12
 */
function formatUUID(hex: string): string {
  // Take first 32 chars (16 bytes = 32 hex chars)
  const h = hex.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Generate a deterministic UUID from a seed string (userId + prefix).
 * Used for CalDAV/CardDAV account UUIDs.
 */
function generateDeterministicUUID(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return formatUUID(hash);
}

/**
 * Build an Apple Configuration Profile (.mobileconfig) XML for CalDAV/CardDAV.
 */
function buildMobileConfig(
  userName: string,
  davToken: string,
  principalUrl: string,
  calendarUrl: string,
  addressbookUrl: string,
  port: number = 443,
): string {
  const caldavUUID = generateDeterministicUUID(`caldav-${userName}`);
  const carddavUUID = generateDeterministicUUID(`carddav-${userName}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>CalDAVHostName</key>
      <string>${principalUrl}</string>
      <key>CalDAVPassword</key>
      <string>${davToken}</string>
      <key>CalDAVPort</key>
      <integer>${port}</integer>
      <key>CalDAVPrincipalURL</key>
      <string>${principalUrl}</string>
      <key>CalDAVUseSSL</key>
      <true/>
      <key>CalDAVUsername</key>
      <string>${userName}</string>
      <key>PayloadDescription</key>
      <string>Cornerstone CalDAV calendar</string>
      <key>PayloadDisplayName</key>
      <string>Cornerstone Calendar</string>
      <key>PayloadIdentifier</key>
      <string>dev.steiler.cornerstone.dav.caldav</string>
      <key>PayloadType</key>
      <string>com.apple.caldav.account</string>
      <key>PayloadUUID</key>
      <string>${caldavUUID}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PreventAppSheet</key>
      <false/>
      <key>PreventExternalSearch</key>
      <false/>
    </dict>
    <dict>
      <key>CardDAVHostName</key>
      <string>${principalUrl}</string>
      <key>CardDAVPassword</key>
      <string>${davToken}</string>
      <key>CardDAVPort</key>
      <integer>${port}</integer>
      <key>CardDAVPrincipalURL</key>
      <string>${principalUrl}</string>
      <key>CardDAVUseSSL</key>
      <true/>
      <key>CardDAVUsername</key>
      <string>${userName}</string>
      <key>PayloadDescription</key>
      <string>Cornerstone CardDAV contacts</string>
      <key>PayloadDisplayName</key>
      <string>Cornerstone Contacts</string>
      <key>PayloadIdentifier</key>
      <string>dev.steiler.cornerstone.dav.carddav</string>
      <key>PayloadType</key>
      <string>com.apple.carddav.account</string>
      <key>PayloadUUID</key>
      <string>${carddavUUID}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PreventAppSheet</key>
      <false/>
      <key>PreventExternalSearch</key>
      <false/>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Cornerstone DAV Services Configuration</string>
  <key>PayloadDisplayName</key>
  <string>Cornerstone</string>
  <key>PayloadIdentifier</key>
  <string>dev.steiler.cornerstone.dav</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${generateDeterministicUUID(`profile-${userName}`)}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

export default async function davTokenRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/users/me/dav/token
   * Get the current DAV token status for the authenticated user.
   * Auth required: Yes (session-based)
   */
  fastify.get(
    '/token',
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const status = davTokenService.getTokenStatus(fastify.db, request.user.id);
      return reply.status(200).send(status);
    },
  );

  /**
   * POST /api/users/me/dav/token
   * Generate or regenerate a DAV token.
   * Auth required: Yes (session-based)
   * Rate limit: 10 per hour
   */
  fastify.post(
    '/token',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const token = davTokenService.generateToken(fastify.db, request.user.id);
      return reply.status(200).send({ token });
    },
  );

  /**
   * DELETE /api/users/me/dav/token
   * Revoke the DAV token.
   * Auth required: Yes (session-based)
   */
  fastify.delete(
    '/token',
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      davTokenService.revokeToken(fastify.db, request.user.id);
      return reply.status(204).send();
    },
  );

  /**
   * GET /api/users/me/dav/profile
   * Get the Apple Configuration Profile for CalDAV/CardDAV.
   * Auth required: Yes (session-based), must have an active DAV token
   */
  fastify.get(
    '/profile',
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const status = davTokenService.getTokenStatus(fastify.db, request.user.id);
      if (!status.hasToken) {
        return reply.status(404).send({
          error: {
            code: 'DAV_TOKEN_NOT_FOUND',
            message: 'No DAV token configured',
          },
        });
      }

      // Fetch the user to get email and current token
      const user = fastify.db
        .select()
        .from(users)
        .where(eq(users.id, request.user!.id))
        .get();

      if (!user || !user.davToken) {
        return reply.status(404).send({
          error: {
            code: 'DAV_TOKEN_NOT_FOUND',
            message: 'No DAV token configured',
          },
        });
      }

      // Build the mobileconfig
      const protocol = request.protocol === 'https' ? 'https' : 'http';
      const hostParts = request.hostname.split(':');
      const host = hostParts[0];
      const port = hostParts[1] ? parseInt(hostParts[1], 10) : protocol === 'https' ? 443 : 80;
      const principalUrl = `${protocol}://${host}/dav/principals/default/`;

      const mobileconfig = buildMobileConfig(
        user.email,
        user.davToken,
        principalUrl,
        `${protocol}://${host}/dav/calendars/default/`,
        `${protocol}://${host}/dav/addressbooks/default/`,
        port,
      );

      return reply
        .type('application/x-apple-aspen-config')
        .header('Content-Disposition', 'attachment; filename="Cornerstone.mobileconfig"')
        .send(mobileconfig);
    },
  );
}
