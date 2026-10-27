/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type * as VendorsApiTypes from './vendorsApi.js';
import type * as MatchTypes from './companyMatch.js';

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
jest.unstable_mockModule('./vendorsApi.js', () => ({ searchCompanies: mockSearchCompanies }));

let findCompanyByName: typeof MatchTypes.findCompanyByName;

const list = (...names: string[]) =>
  names.map((name, i) => ({ id: `v-${i + 1}`, name })) as unknown as Awaited<
    ReturnType<typeof VendorsApiTypes.searchCompanies>
  >;

beforeEach(async () => {
  mockSearchCompanies.mockReset();
  ({ findCompanyByName } = await import('./companyMatch.js'));
});

describe('findCompanyByName', () => {
  it('returns the single company whose name equals the text', async () => {
    mockSearchCompanies.mockResolvedValue(list('Acme Roofing', 'Acme Roofing Supplies'));
    expect(await findCompanyByName('Acme Roofing')).toEqual({ id: 'v-1', name: 'Acme Roofing' });
    expect(mockSearchCompanies).toHaveBeenCalledWith('Acme Roofing');
  });

  it('ignores case and accents', async () => {
    mockSearchCompanies.mockResolvedValue(list('Müller Bäder'));
    expect(await findCompanyByName('MULLER bäder')).toEqual({
      id: 'v-1',
      name: 'Müller Bäder',
    });
  });

  it('returns null when nothing matches exactly (only partial matches)', async () => {
    mockSearchCompanies.mockResolvedValue(list('Acme Roofing Supplies'));
    expect(await findCompanyByName('Acme Roofing')).toBeNull();
  });

  it('returns null when two companies match', async () => {
    mockSearchCompanies.mockResolvedValue(list('Acme Roofing', 'ACME ROOFING'));
    expect(await findCompanyByName('Acme Roofing')).toBeNull();
  });

  it('returns null when the lookup fails', async () => {
    mockSearchCompanies.mockRejectedValue(new Error('down'));
    expect(await findCompanyByName('Acme Roofing')).toBeNull();
  });
});
