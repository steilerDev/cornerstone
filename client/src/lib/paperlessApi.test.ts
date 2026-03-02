import { jest } from '@jest/globals';
import type * as PaperlessApiModule from './paperlessApi.js';

// Mock apiClient before imports
const mockGet = jest.fn<() => Promise<unknown>>();
const mockGetBaseUrl = jest.fn<() => string>().mockReturnValue('/api');

jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  getBaseUrl: mockGetBaseUrl,
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
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
let paperlessApi: typeof PaperlessApiModule;

beforeEach(async () => {
  paperlessApi = (await import('./paperlessApi.js')) as typeof PaperlessApiModule;
  mockGet.mockReset();
  mockGetBaseUrl.mockReturnValue('/api');
});

describe('paperlessApi', () => {
  describe('getPaperlessStatus', () => {
    it('calls GET /paperless/status and returns response', async () => {
      const mockStatus = { configured: true, reachable: true, error: null };
      mockGet.mockResolvedValueOnce(mockStatus);

      const result = await paperlessApi.getPaperlessStatus();

      expect(mockGet).toHaveBeenCalledWith('/paperless/status');
      expect(result).toEqual(mockStatus);
    });

    it('returns not configured status', async () => {
      const mockStatus = { configured: false, reachable: false, error: null };
      mockGet.mockResolvedValueOnce(mockStatus);

      const result = await paperlessApi.getPaperlessStatus();
      expect(result).toEqual(mockStatus);
    });
  });

  describe('listPaperlessDocuments', () => {
    it('calls GET /paperless/documents with no query when no args', async () => {
      const mockResponse = {
        documents: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await paperlessApi.listPaperlessDocuments();

      expect(mockGet).toHaveBeenCalledWith('/paperless/documents');
      expect(result).toEqual(mockResponse);
    });

    it('appends query string when query is provided', async () => {
      mockGet.mockResolvedValueOnce({
        documents: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      });

      await paperlessApi.listPaperlessDocuments({ query: 'invoice' });

      expect(mockGet).toHaveBeenCalledWith('/paperless/documents?query=invoice');
    });

    it('appends tags query string', async () => {
      mockGet.mockResolvedValueOnce({
        documents: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      });

      await paperlessApi.listPaperlessDocuments({ tags: '1,2,3' });

      expect(mockGet).toHaveBeenCalledWith('/paperless/documents?tags=1%2C2%2C3');
    });

    it('appends page and pageSize', async () => {
      mockGet.mockResolvedValueOnce({
        documents: [],
        pagination: { page: 2, pageSize: 10, totalItems: 0, totalPages: 0 },
      });

      await paperlessApi.listPaperlessDocuments({ page: 2, pageSize: 10 });

      const url = (mockGet.mock.calls[0] as string[])[0];
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=10');
    });

    it('appends correspondent and documentType as numbers', async () => {
      mockGet.mockResolvedValueOnce({
        documents: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      });

      await paperlessApi.listPaperlessDocuments({ correspondent: 5, documentType: 3 });

      const url = (mockGet.mock.calls[0] as string[])[0];
      expect(url).toContain('correspondent=5');
      expect(url).toContain('documentType=3');
    });

    it('appends sortBy and sortOrder', async () => {
      mockGet.mockResolvedValueOnce({
        documents: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      });

      await paperlessApi.listPaperlessDocuments({ sortBy: 'created', sortOrder: 'desc' });

      const url = (mockGet.mock.calls[0] as string[])[0];
      expect(url).toContain('sortBy=created');
      expect(url).toContain('sortOrder=desc');
    });

    it('omits undefined values from query string', async () => {
      mockGet.mockResolvedValueOnce({
        documents: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      });

      await paperlessApi.listPaperlessDocuments({ query: undefined, page: 1 });

      const url = (mockGet.mock.calls[0] as string[])[0];
      expect(url).not.toContain('query=');
      expect(url).toContain('page=1');
    });
  });

  describe('getPaperlessDocument', () => {
    it('calls GET /paperless/documents/:id', async () => {
      const mockDoc = {
        document: {
          id: 42,
          title: 'Test Doc',
          content: null,
          tags: [],
          created: null,
          added: null,
          modified: null,
          correspondent: null,
          documentType: null,
          archiveSerialNumber: null,
          originalFileName: null,
          pageCount: null,
        },
      };
      mockGet.mockResolvedValueOnce(mockDoc);

      const result = await paperlessApi.getPaperlessDocument(42);

      expect(mockGet).toHaveBeenCalledWith('/paperless/documents/42');
      expect(result).toEqual(mockDoc);
    });
  });

  describe('listPaperlessTags', () => {
    it('calls GET /paperless/tags and returns response', async () => {
      const mockResponse = {
        tags: [{ id: 1, name: 'Invoice', color: '#ff0000', documentCount: 5 }],
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await paperlessApi.listPaperlessTags();

      expect(mockGet).toHaveBeenCalledWith('/paperless/tags');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getDocumentThumbnailUrl', () => {
    it('returns correct thumbnail URL', () => {
      const url = paperlessApi.getDocumentThumbnailUrl(42);
      expect(url).toBe('/api/paperless/documents/42/thumb');
    });

    it('uses getBaseUrl for the base', () => {
      mockGetBaseUrl.mockReturnValue('https://example.com/api');
      const url = paperlessApi.getDocumentThumbnailUrl(7);
      expect(url).toBe('https://example.com/api/paperless/documents/7/thumb');
    });
  });

  describe('getDocumentPreviewUrl', () => {
    it('returns correct preview URL', () => {
      const url = paperlessApi.getDocumentPreviewUrl(99);
      expect(url).toBe('/api/paperless/documents/99/preview');
    });

    it('uses getBaseUrl for the base', () => {
      mockGetBaseUrl.mockReturnValue('https://example.com/api');
      const url = paperlessApi.getDocumentPreviewUrl(1);
      expect(url).toBe('https://example.com/api/paperless/documents/1/preview');
    });
  });
});
