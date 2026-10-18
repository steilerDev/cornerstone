import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getIntegrationsStatus } from './integrationsApi.js';

describe('integrationsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('GETs /api/settings/integrations and returns the body', async () => {
    const body = { money: { currency: 'EUR', vatRate: 0.19, env: { required: [], optional: [] } } };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response);

    const result = await getIntegrationsStatus();

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/integrations', expect.any(Object));
    expect(result).toEqual(body);
  });

  it('rejects when the server answers 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'FORBIDDEN', message: 'no' } }),
    } as Response);

    await expect(getIntegrationsStatus()).rejects.toMatchObject({ statusCode: 403 });
  });
});
