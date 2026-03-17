import { describe, it, expect } from '@jest/globals';
import {
  parseDepth,
  parsePropfindProps,
  parseReportHrefs,
  multistatus,
  response,
  propstat,
  propstatNotFound,
  CALENDAR_COLLECTION_PROPS,
  ADDRESSBOOK_COLLECTION_PROPS,
} from './davXml.js';

describe('davXml', () => {
  // ─── parseDepth ─────────────────────────────────────────────────────────────

  describe('parseDepth', () => {
    it('returns 0 for missing depth header', () => {
      expect(parseDepth({})).toBe(0);
    });

    it('returns 0 for undefined depth', () => {
      expect(parseDepth({ depth: undefined })).toBe(0);
    });

    it('returns 0 for depth "0"', () => {
      expect(parseDepth({ depth: '0' })).toBe(0);
    });

    it('returns 1 for depth "1"', () => {
      expect(parseDepth({ depth: '1' })).toBe(1);
    });

    it('returns "infinity" for depth "infinity"', () => {
      expect(parseDepth({ depth: 'infinity' })).toBe('infinity');
    });

    it('returns 0 for unknown/invalid depth string', () => {
      expect(parseDepth({ depth: 'bogus' })).toBe(0);
    });

    it('handles array header values (takes first element)', () => {
      expect(parseDepth({ depth: ['1', '2'] })).toBe(1);
    });
  });

  // ─── parsePropfindProps ─────────────────────────────────────────────────────

  describe('parsePropfindProps', () => {
    it('returns ["allprop"] for empty body', () => {
      expect(parsePropfindProps('')).toEqual(['allprop']);
    });

    it('returns ["allprop"] for body with <allprop/>', () => {
      const body = `<?xml version="1.0"?>
<D:propfind xmlns:D="DAV:">
  <D:allprop/>
</D:propfind>`;
      // No <prop> block — should return allprop
      expect(parsePropfindProps(body)).toEqual(['allprop']);
    });

    it('returns ["allprop"] for null-ish body without <prop>', () => {
      expect(parsePropfindProps('<propfind/>')).toEqual(['allprop']);
    });

    it('returns array of property names from <prop> block', () => {
      const body = `<?xml version="1.0"?>
<D:propfind xmlns:D="DAV:">
  <prop>
    <displayname/>
    <resourcetype/>
    <getetag/>
  </prop>
</D:propfind>`;
      const props = parsePropfindProps(body);
      expect(props).toContain('displayname');
      expect(props).toContain('resourcetype');
      expect(props).toContain('getetag');
      expect(props).not.toContain('allprop');
    });

    it('lowercases property names', () => {
      const body = `<prop><DisplayName/><GETETAG/></prop>`;
      const props = parsePropfindProps(body);
      expect(props).toContain('displayname');
      expect(props).toContain('getetag');
    });
  });

  // ─── parseReportHrefs ───────────────────────────────────────────────────────

  describe('parseReportHrefs', () => {
    it('returns empty array for body with no hrefs', () => {
      expect(parseReportHrefs('<report/>')).toEqual([]);
    });

    it('extracts single href', () => {
      const body = `<report><href>/calendars/default/wi-abc.ics</href></report>`;
      expect(parseReportHrefs(body)).toEqual(['/calendars/default/wi-abc.ics']);
    });

    it('extracts multiple hrefs', () => {
      const body = `<report>
<href>/calendars/default/wi-1.ics</href>
<href>/calendars/default/wi-2.ics</href>
<href>/addressbooks/default/vendor-3.vcf</href>
</report>`;
      const hrefs = parseReportHrefs(body);
      expect(hrefs).toHaveLength(3);
      expect(hrefs[0]).toBe('/calendars/default/wi-1.ics');
      expect(hrefs[1]).toBe('/calendars/default/wi-2.ics');
      expect(hrefs[2]).toBe('/addressbooks/default/vendor-3.vcf');
    });

    it('trims whitespace from hrefs', () => {
      const body = `<report><href>  /calendars/default/wi-abc.ics  </href></report>`;
      expect(parseReportHrefs(body)).toEqual(['/calendars/default/wi-abc.ics']);
    });

    it('is case-insensitive for href tag', () => {
      const body = `<report><HREF>/calendars/default/wi-abc.ics</HREF></report>`;
      expect(parseReportHrefs(body)).toEqual(['/calendars/default/wi-abc.ics']);
    });
  });

  // ─── multistatus ────────────────────────────────────────────────────────────

  describe('multistatus', () => {
    it('wraps responses in correct XML envelope', () => {
      const xml = multistatus(['<D:response>foo</D:response>']);
      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"');
      expect(xml).toContain('<D:multistatus xmlns:D="DAV:"');
      expect(xml).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
      expect(xml).toContain('xmlns:A="urn:ietf:params:xml:ns:carddav"');
      expect(xml).toContain('xmlns:CS="http://calendarserver.org/ns/"');
      expect(xml).toContain('<D:response>foo</D:response>');
      expect(xml).toContain('</D:multistatus>');
    });

    it('handles empty response array', () => {
      const xml = multistatus([]);
      expect(xml).toContain('<D:multistatus');
      expect(xml).toContain('</D:multistatus>');
    });

    it('includes multiple responses', () => {
      const xml = multistatus(['<D:response>a</D:response>', '<D:response>b</D:response>']);
      expect(xml).toContain('<D:response>a</D:response>');
      expect(xml).toContain('<D:response>b</D:response>');
    });
  });

  // ─── response ───────────────────────────────────────────────────────────────

  describe('response', () => {
    it('wraps href and propstat in D:response', () => {
      const xml = response('/test/', '<D:propstat>x</D:propstat>');
      expect(xml).toContain('<D:response>');
      expect(xml).toContain('<D:href>/test/</D:href>');
      expect(xml).toContain('<D:propstat>x</D:propstat>');
      expect(xml).toContain('</D:response>');
    });

    it('escapes XML special characters in href', () => {
      const xml = response('/path?a=1&b=2', '');
      expect(xml).toContain('&amp;');
    });
  });

  // ─── propstat (200 OK) ──────────────────────────────────────────────────────

  describe('propstat', () => {
    it('wraps props in D:propstat with 200 OK status', () => {
      const xml = propstat('<D:displayname>Test</D:displayname>');
      expect(xml).toContain('<D:propstat>');
      expect(xml).toContain('<D:prop>');
      expect(xml).toContain('<D:displayname>Test</D:displayname>');
      expect(xml).toContain('</D:prop>');
      expect(xml).toContain('<D:status>HTTP/1.1 200 OK</D:status>');
      expect(xml).toContain('</D:propstat>');
    });
  });

  // ─── propstatNotFound ───────────────────────────────────────────────────────

  describe('propstatNotFound', () => {
    it('produces propstat with 404 Not Found status', () => {
      const xml = propstatNotFound(['getetag', 'displayname']);
      expect(xml).toContain('<D:propstat>');
      expect(xml).toContain('<D:status>HTTP/1.1 404 Not Found</D:status>');
      expect(xml).toContain('<D:getetag/>');
      expect(xml).toContain('<D:displayname/>');
    });

    it('handles empty prop list', () => {
      const xml = propstatNotFound([]);
      expect(xml).toContain('<D:status>HTTP/1.1 404 Not Found</D:status>');
    });
  });

  // ─── Collection prop constants ──────────────────────────────────────────────

  describe('CALENDAR_COLLECTION_PROPS', () => {
    it('contains calendar resourcetype', () => {
      expect(CALENDAR_COLLECTION_PROPS).toContain('<C:calendar/>');
    });

    it('contains supported calendar component set', () => {
      expect(CALENDAR_COLLECTION_PROPS).toContain('supported-calendar-component-set');
      expect(CALENDAR_COLLECTION_PROPS).toContain('VEVENT');
      expect(CALENDAR_COLLECTION_PROPS).toContain('VTODO');
    });

    it('contains displayname', () => {
      expect(CALENDAR_COLLECTION_PROPS).toContain('Cornerstone Project Calendar');
    });
  });

  describe('ADDRESSBOOK_COLLECTION_PROPS', () => {
    it('contains addressbook resourcetype', () => {
      expect(ADDRESSBOOK_COLLECTION_PROPS).toContain('<A:addressbook/>');
    });

    it('contains displayname', () => {
      expect(ADDRESSBOOK_COLLECTION_PROPS).toContain('Cornerstone Contacts');
    });
  });
});
