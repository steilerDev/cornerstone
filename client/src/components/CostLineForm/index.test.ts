/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';

describe('CostLineForm barrel', () => {
  it('exports the form, the grid and the grid model helpers', async () => {
    const barrel = await import('./index.js');

    for (const name of [
      'AutoItemizeLines',
      'CostLineForm',
      'LinkInvoiceForm',
      'CostLineGridDialog',
      'CostLineGrid',
      'blankGridRow',
      'gridRowGross',
      'nextRowId',
      'rowsToSave',
      'validateGridRows',
      'withTrailingBlank',
    ]) {
      expect(barrel).toHaveProperty(name);
      expect(typeof (barrel as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('no longer exports the retired target picker (the grid and form use EntityPicker)', async () => {
    const barrel = await import('./index.js');

    expect(Object.keys(barrel)).not.toContain('CostLineTargetPicker');
    expect(Object.keys(barrel)).not.toContain('CostLineCompanyPicker');
  });
});
