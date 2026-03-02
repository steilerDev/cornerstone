import { jest } from '@jest/globals';
import type * as DocumentLinksApiModule from './documentLinksApi.js';

// Mock apiClient before imports
const mockGet = jest.fn<() => Promise<unknown>>();
const mockPost = jest.fn<() => Promise<unknown>>();
const mockDel = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  post: mockPost,
  del: mockDel,
  patch: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: class ApiClientError extends Error {
    statusCode: number;
    error: unknown;
    constructor(statusCode: number, error: unknown) {
      super('error');
      this.statusCode = statusCode;
      this.error = error;
    }
  },
  NetworkError: class NetworkError extends Error {},
}));

// Deferred import after mock
let documentLinksApi: typeof DocumentLinksApiModule;

beforeEach(async () => {
  documentLinksApi = (await import('./documentLinksApi.js')) as typeof DocumentLinksApiModule;
  mockGet.mockReset();
  mockPost.mockReset();
  mockDel.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('documentLinksApi', () => {
  describe('listDocumentLinks', () => {
    it('calls GET /document-links with entityType and entityId query params and returns documentLinks array', async () => {
      const mockLinks = [
        {
          id: 'link-1',
          entityType: 'work_item',
          entityId: 'wi-abc',
          paperlessDocumentId: 42,
          createdBy: null,
          createdAt: '2026-01-01T00:00:00Z',
          document: null,
        },
      ];
      mockGet.mockResolvedValueOnce({ documentLinks: mockLinks });

      const result = await documentLinksApi.listDocumentLinks('work_item', 'wi-abc');

      expect(mockGet).toHaveBeenCalledWith('/document-links?entityType=work_item&entityId=wi-abc');
      expect(result).toEqual(mockLinks);
    });

    it('returns empty array when documentLinks is empty', async () => {
      mockGet.mockResolvedValueOnce({ documentLinks: [] });

      const result = await documentLinksApi.listDocumentLinks('work_item', 'wi-abc');

      expect(result).toEqual([]);
    });

    it('passes entityType and entityId exactly as provided', async () => {
      mockGet.mockResolvedValueOnce({ documentLinks: [] });

      await documentLinksApi.listDocumentLinks('invoice', 'inv-999');

      expect(mockGet).toHaveBeenCalledWith('/document-links?entityType=invoice&entityId=inv-999');
    });

    it('returns multiple links from the response', async () => {
      const mockLinks = [
        {
          id: 'link-1',
          entityType: 'work_item',
          entityId: 'wi-abc',
          paperlessDocumentId: 42,
          createdBy: null,
          createdAt: '2026-01-01T00:00:00Z',
          document: null,
        },
        {
          id: 'link-2',
          entityType: 'work_item',
          entityId: 'wi-abc',
          paperlessDocumentId: 99,
          createdBy: { id: 'user-1', displayName: 'Frank' },
          createdAt: '2026-01-02T00:00:00Z',
          document: null,
        },
      ];
      mockGet.mockResolvedValueOnce({ documentLinks: mockLinks });

      const result = await documentLinksApi.listDocumentLinks('work_item', 'wi-abc');

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockLinks);
    });
  });

  describe('createDocumentLink', () => {
    it('calls POST /document-links with the correct body and returns documentLink', async () => {
      const mockLink = {
        id: 'link-123',
        entityType: 'work_item',
        entityId: 'wi-abc',
        paperlessDocumentId: 42,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockPost.mockResolvedValueOnce({ documentLink: mockLink });

      const result = await documentLinksApi.createDocumentLink({
        entityType: 'work_item',
        entityId: 'wi-abc',
        paperlessDocumentId: 42,
      });

      expect(mockPost).toHaveBeenCalledWith('/document-links', {
        entityType: 'work_item',
        entityId: 'wi-abc',
        paperlessDocumentId: 42,
      });
      expect(result).toEqual(mockLink);
    });

    it('passes all fields in the request body correctly', async () => {
      const mockLink = {
        id: 'link-456',
        entityType: 'invoice',
        entityId: 'inv-888',
        paperlessDocumentId: 7,
        createdBy: null,
        createdAt: '2026-02-15T12:00:00Z',
      };
      mockPost.mockResolvedValueOnce({ documentLink: mockLink });

      await documentLinksApi.createDocumentLink({
        entityType: 'invoice',
        entityId: 'inv-888',
        paperlessDocumentId: 7,
      });

      expect(mockPost).toHaveBeenCalledWith('/document-links', {
        entityType: 'invoice',
        entityId: 'inv-888',
        paperlessDocumentId: 7,
      });
    });

    it('returns the created link from the response', async () => {
      const mockLink = {
        id: 'link-789',
        entityType: 'household_item',
        entityId: 'hi-001',
        paperlessDocumentId: 55,
        createdBy: { id: 'user-1', displayName: 'Alice' },
        createdAt: '2026-03-01T08:00:00Z',
      };
      mockPost.mockResolvedValueOnce({ documentLink: mockLink });

      const result = await documentLinksApi.createDocumentLink({
        entityType: 'household_item',
        entityId: 'hi-001',
        paperlessDocumentId: 55,
      });

      expect(result).toEqual(mockLink);
    });
  });

  describe('deleteDocumentLink', () => {
    it('calls DELETE /document-links/:id and returns void', async () => {
      mockDel.mockResolvedValueOnce(undefined);

      const result = await documentLinksApi.deleteDocumentLink('link-123');

      expect(mockDel).toHaveBeenCalledWith('/document-links/link-123');
      expect(result).toBeUndefined();
    });

    it('passes the link id in the URL path', async () => {
      mockDel.mockResolvedValueOnce(undefined);

      await documentLinksApi.deleteDocumentLink('link-abc-xyz-999');

      expect(mockDel).toHaveBeenCalledWith('/document-links/link-abc-xyz-999');
    });

    it('propagates errors from the API client', async () => {
      mockDel.mockRejectedValueOnce(new Error('Not Found'));

      await expect(documentLinksApi.deleteDocumentLink('link-does-not-exist')).rejects.toThrow(
        'Not Found',
      );
    });
  });
});
