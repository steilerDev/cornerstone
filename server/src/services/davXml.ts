/**
 * DAV XML utilities for CalDAV/CardDAV PROPFIND/REPORT responses.
 * Handles XML generation and parsing for WebDAV protocol.
 */

// XML namespace URIs
const NAMESPACE_DAV = 'DAV:';
const NAMESPACE_CALDAV = 'urn:ietf:params:xml:ns:caldav';
const NAMESPACE_CARDDAV = 'urn:ietf:params:xml:ns:carddav';

/**
 * Parse the Depth header from a PROPFIND request.
 * Returns 0, 1, or 'infinity', defaults to 0 if missing.
 */
export function parseDepth(
  headers: Record<string, string | string[] | undefined>,
): number | string {
  const depth = headers.depth;
  if (!depth) return 0;
  const depthStr = Array.isArray(depth) ? depth[0] : depth;
  if (!depthStr || depthStr === 'infinity') return depthStr === 'infinity' ? 'infinity' : 0;
  const parsed = parseInt(depthStr, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse PROPFIND body to extract requested properties.
 * Returns array of property names like 'displayname', 'resourcetype', etc.
 */
export function parsePropfindProps(body: string): string[] {
  if (!body || !/<(?:[a-z]+:)?prop[ >]/i.test(body)) {
    // allprop if no body or no <prop> section
    return ['allprop'];
  }

  const match = body.match(/<(?:[a-z]+:)?prop>([\s\S]*?)<\/(?:[a-z]+:)?prop>/);
  if (!match) return ['allprop'];

  const propSection = match[1]!;
  const props: string[] = [];

  // Extract tag names from prop section
  const tagMatches = propSection.matchAll(/<(?:[a-z]+:)?([a-z][-a-z]*)[^>]*>/gi);
  for (const m of tagMatches) {
    props.push(m[1]!.toLowerCase());
    // m[1] is defined: capture group ([a-z][-a-z]*) is required in the pattern
  }

  return props.length > 0 ? props : ['allprop'];
}

/**
 * Parse REPORT body to extract hrefs.
 * Used for calendar-multiget and addressbook-multiget REPORT requests.
 */
export function parseReportHrefs(body: string): string[] {
  const hrefs: string[] = [];
  const hrefMatches = body.matchAll(/<(?:[a-z]+:)?href[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?href>/gi);
  for (const match of hrefMatches) {
    hrefs.push(match[1]!.trim());
    // match[1] is defined: capture group ([\s\S]*?) is required in the pattern
  }
  return hrefs;
}

/**
 * Detect the REPORT type from the body.
 * Returns 'multiget', 'query', or 'unknown'.
 */
export function detectReportType(body: string): 'multiget' | 'query' | 'unknown' {
  if (/calendar-multiget|addressbook-multiget/i.test(body)) return 'multiget';
  if (/calendar-query|addressbook-query/i.test(body)) return 'query';
  return 'unknown';
}

/**
 * Build a multistatus response wrapper.
 */
export function multistatus(responses: string[]): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="urn:ietf:params:xml:ns:carddav" xmlns:CS="http://calendarserver.org/ns/">
${responses.join('\n')}
</D:multistatus>`;
}

/**
 * Build a single response element within multistatus.
 * Returns a propstat response with 200 OK status.
 */
export function response(href: string, propstat: string): string {
  return `<D:response>
<D:href>${escapeXml(href)}</D:href>
${propstat}
</D:response>`;
}

/**
 * Build a propstat element with 200 OK status.
 */
export function propstat(props: string): string {
  return `<D:propstat>
<D:prop>
${props}
</D:prop>
<D:status>HTTP/1.1 200 OK</D:status>
</D:propstat>`;
}

/**
 * Build a propstat element with 404 Not Found status.
 */
export function propstatNotFound(propNames: string[]): string {
  const props = propNames.map((p) => `<D:${escapeXml(p)}/>`).join('\n');
  return `<D:propstat>
<D:prop>
${props}
</D:prop>
<D:status>HTTP/1.1 404 Not Found</D:status>
</D:propstat>`;
}

/**
 * Escape special XML characters in text content.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Collection Property Templates ────────────────────────────────────────

/**
 * Calendar collection properties (for PROPFIND depth 0).
 * Includes getctag (Calendar Server extension) required by iOS for change detection.
 */
export const CALENDAR_COLLECTION_PROPS = `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
<D:displayname>Cornerstone Project Calendar</D:displayname>
<D:getetag>"calendar-etag"</D:getetag>
<CS:getctag>"calendar-etag"</CS:getctag>
<C:supported-calendar-component-set>
<C:comp name="VEVENT"/>
<C:comp name="VTODO"/>
</C:supported-calendar-component-set>
<D:supported-report-set>
<D:supported-report><D:report><C:calendar-multiget/></D:report></D:supported-report>
<D:supported-report><D:report><C:calendar-query/></D:report></D:supported-report>
</D:supported-report-set>
<D:current-user-privilege-set>
<D:privilege><D:read/></D:privilege>
<D:privilege><D:read-current-user-privilege-set/></D:privilege>
</D:current-user-privilege-set>`;

/**
 * Address book collection properties (for PROPFIND depth 0).
 * Includes getctag (Calendar Server extension) required by iOS for change detection.
 */
export const ADDRESSBOOK_COLLECTION_PROPS = `<D:resourcetype><D:collection/><A:addressbook/></D:resourcetype>
<D:displayname>Cornerstone Contacts</D:displayname>
<D:getetag>"addressbook-etag"</D:getetag>
<CS:getctag>"addressbook-etag"</CS:getctag>
<D:supported-report-set>
<D:supported-report><D:report><A:addressbook-multiget/></D:report></D:supported-report>
<D:supported-report><D:report><A:addressbook-query/></D:report></D:supported-report>
</D:supported-report-set>
<D:current-user-privilege-set>
<D:privilege><D:read/></D:privilege>
<D:privilege><D:read-current-user-privilege-set/></D:privilege>
</D:current-user-privilege-set>`;
