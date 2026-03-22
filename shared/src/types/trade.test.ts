/**
 * Type-level tests for shared trade types.
 *
 * Verifies that the TypeScript interfaces for Trade (TradeSummary, TradeResponse,
 * TradeListResponse, etc.) are correctly shaped for the Areas & Trades rework
 * introduced in Story #1030.
 *
 * Trades replace the old specialty string field on Vendor.
 */

import { describe, it, expect } from '@jest/globals';
import type {
  TradeSummary,
  TradeResponse,
  TradeListResponse,
  TradeSingleResponse,
  CreateTradeRequest,
  UpdateTradeRequest,
  TradeListQuery,
} from './trade.js';

// ---------------------------------------------------------------------------
// TradeSummary interface
// ---------------------------------------------------------------------------

describe('TradeSummary interface', () => {
  it('constructs a valid trade summary with all fields', () => {
    const trade: TradeSummary = {
      id: 'trade-plumbing',
      name: 'Plumbing',
      color: '#0EA5E9',
      translationKey: 'trades.plumbing',
    };

    expect(trade.id).toBe('trade-plumbing');
    expect(trade.name).toBe('Plumbing');
    expect(trade.color).toBe('#0EA5E9');
  });

  it('allows color to be null', () => {
    const trade: TradeSummary = {
      id: 'trade-custom',
      name: 'Custom Trade',
      color: null,
      translationKey: null,
    };

    expect(trade.id).toBe('trade-custom');
    expect(trade.name).toBe('Custom Trade');
    expect(trade.color).toBeNull();
  });

  it('accepts all 15 default trade IDs seeded by migration 0028', () => {
    const defaultTradeIds = [
      'trade-plumbing',
      'trade-hvac',
      'trade-electrical',
      'trade-drywall',
      'trade-carpentry',
      'trade-masonry',
      'trade-painting',
      'trade-roofing',
      'trade-flooring',
      'trade-tiling',
      'trade-landscaping',
      'trade-excavation',
      'trade-general-contractor',
      'trade-architect-design',
      'trade-other',
    ];

    expect(defaultTradeIds).toHaveLength(15);

    for (const id of defaultTradeIds) {
      const trade: TradeSummary = { id, name: id, color: null, translationKey: null };
      expect(trade.id).toBe(id);
    }
  });
});

// ---------------------------------------------------------------------------
// TradeResponse interface
// ---------------------------------------------------------------------------

describe('TradeResponse interface', () => {
  it('constructs a valid trade response with all fields', () => {
    const trade: TradeResponse = {
      id: 'trade-electrical',
      name: 'Electrical',
      color: '#F59E0B',
      description: 'Wiring, lighting, power systems',
      translationKey: 'trades.electrical',
      sortOrder: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(trade.id).toBe('trade-electrical');
    expect(trade.name).toBe('Electrical');
    expect(trade.color).toBe('#F59E0B');
    expect(trade.description).toBe('Wiring, lighting, power systems');
    expect(trade.sortOrder).toBe(2);
    expect(trade.createdAt).toBe('2026-01-01T00:00:00Z');
  });

  it('allows color and description to be null', () => {
    const trade: TradeResponse = {
      id: 'trade-custom',
      name: 'Custom',
      color: null,
      description: null,
      translationKey: null,
      sortOrder: 100,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(trade.color).toBeNull();
    expect(trade.description).toBeNull();
    expect(trade.sortOrder).toBe(100);
  });

  it('sort order is a non-negative integer', () => {
    const trade: TradeResponse = {
      id: 'trade-other',
      name: 'Other',
      color: '#6B7280',
      description: 'Miscellaneous trades',
      translationKey: 'trades.other',
      sortOrder: 14,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(trade.sortOrder).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(trade.sortOrder)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TradeListResponse interface
// ---------------------------------------------------------------------------

describe('TradeListResponse interface', () => {
  it('constructs a valid list response with multiple trades', () => {
    const response: TradeListResponse = {
      trades: [
        {
          id: 'trade-plumbing',
          name: 'Plumbing',
          color: '#0EA5E9',
          description: 'Water supply, drainage, sanitary installations',
          translationKey: 'trades.plumbing',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'trade-hvac',
          name: 'HVAC',
          color: '#8B5CF6',
          description: 'Heating, ventilation, air conditioning',
          translationKey: 'trades.hvac',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };

    expect(response.trades).toHaveLength(2);
    expect(response.trades[0].id).toBe('trade-plumbing');
    expect(response.trades[1].id).toBe('trade-hvac');
  });

  it('handles empty trades list', () => {
    const response: TradeListResponse = { trades: [] };
    expect(response.trades).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TradeSingleResponse interface
// ---------------------------------------------------------------------------

describe('TradeSingleResponse interface', () => {
  it('wraps a TradeResponse in the trade field', () => {
    const response: TradeSingleResponse = {
      trade: {
        id: 'trade-carpentry',
        name: 'Carpentry',
        color: '#92400E',
        description: 'Wood framing, trim, cabinetry',
        translationKey: 'trades.carpentry',
        sortOrder: 4,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    };

    expect(response.trade.id).toBe('trade-carpentry');
    expect(response.trade.name).toBe('Carpentry');
    expect(response.trade.sortOrder).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// CreateTradeRequest interface
// ---------------------------------------------------------------------------

describe('CreateTradeRequest interface', () => {
  it('requires only name — all other fields optional', () => {
    const request: CreateTradeRequest = {
      name: 'Metalwork',
    };

    expect(request.name).toBe('Metalwork');
    expect(request.color).toBeUndefined();
    expect(request.description).toBeUndefined();
    expect(request.sortOrder).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const request: CreateTradeRequest = {
      name: 'Custom Trade',
      color: '#6B7280',
      description: 'Specialised trade work',
      sortOrder: 99,
    };

    expect(request.name).toBe('Custom Trade');
    expect(request.color).toBe('#6B7280');
    expect(request.description).toBe('Specialised trade work');
    expect(request.sortOrder).toBe(99);
  });

  it('accepts null for nullable optional fields', () => {
    const request: CreateTradeRequest = {
      name: 'No Color Trade',
      color: null,
      description: null,
    };

    expect(request.color).toBeNull();
    expect(request.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UpdateTradeRequest interface
// ---------------------------------------------------------------------------

describe('UpdateTradeRequest interface', () => {
  it('allows empty update (all fields optional)', () => {
    const request: UpdateTradeRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });

  it('allows updating name only', () => {
    const request: UpdateTradeRequest = {
      name: 'Updated Trade Name',
    };

    expect(request.name).toBe('Updated Trade Name');
    expect(request.color).toBeUndefined();
    expect(request.description).toBeUndefined();
    expect(request.sortOrder).toBeUndefined();
  });

  it('allows updating color and description', () => {
    const request: UpdateTradeRequest = {
      color: '#22C55E',
      description: 'Updated description',
    };

    expect(request.color).toBe('#22C55E');
    expect(request.description).toBe('Updated description');
  });

  it('allows clearing color and description to null', () => {
    const request: UpdateTradeRequest = {
      color: null,
      description: null,
    };

    expect(request.color).toBeNull();
    expect(request.description).toBeNull();
  });

  it('allows updating sortOrder', () => {
    const request: UpdateTradeRequest = { sortOrder: 10 };
    expect(request.sortOrder).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// TradeListQuery interface
// ---------------------------------------------------------------------------

describe('TradeListQuery interface', () => {
  it('accepts optional search parameter', () => {
    const query: TradeListQuery = { search: 'plumb' };
    expect(query.search).toBe('plumb');
  });

  it('allows empty query (all fields optional)', () => {
    const query: TradeListQuery = {};
    expect(Object.keys(query)).toHaveLength(0);
  });
});
