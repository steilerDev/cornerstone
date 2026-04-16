/**
 * Type-level tests for shared area types.
 *
 * Verifies that the TypeScript interfaces for Area (AreaSummary, AreaResponse,
 * AreaListResponse, etc.) are correctly shaped for the Areas & Trades rework
 * introduced in Story #1030.
 */

import { describe, it, expect } from '@jest/globals';
import type {
  AreaSummary,
  AreaResponse,
  AreaListResponse,
  AreaSingleResponse,
  CreateAreaRequest,
  UpdateAreaRequest,
  AreaListQuery,
} from './area.js';

// ---------------------------------------------------------------------------
// AreaSummary interface
// ---------------------------------------------------------------------------

describe('AreaSummary interface', () => {
  it('constructs a valid area summary with all fields', () => {
    const area: AreaSummary = {
      id: 'area-kitchen',
      name: 'Kitchen',
      color: '#FF5733',
      ancestors: [],
    };

    expect(area.id).toBe('area-kitchen');
    expect(area.name).toBe('Kitchen');
    expect(area.color).toBe('#FF5733');
    expect(area.ancestors).toEqual([]);
  });

  it('allows color to be null', () => {
    const area: AreaSummary = {
      id: 'area-storage',
      name: 'Storage',
      color: null,
      ancestors: [],
    };

    expect(area.id).toBe('area-storage');
    expect(area.name).toBe('Storage');
    expect(area.color).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AreaResponse interface
// ---------------------------------------------------------------------------

describe('AreaResponse interface', () => {
  it('constructs a valid top-level area response', () => {
    const area: AreaResponse = {
      id: 'area-ground-floor',
      name: 'Ground Floor',
      parentId: null,
      color: '#3B82F6',
      description: 'All rooms on the ground floor',
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(area.id).toBe('area-ground-floor');
    expect(area.name).toBe('Ground Floor');
    expect(area.parentId).toBeNull();
    expect(area.color).toBe('#3B82F6');
    expect(area.description).toBe('All rooms on the ground floor');
    expect(area.sortOrder).toBe(0);
    expect(area.createdAt).toBe('2026-01-01T00:00:00Z');
  });

  it('constructs a valid child area response with a parentId', () => {
    const area: AreaResponse = {
      id: 'area-kitchen',
      name: 'Kitchen',
      parentId: 'area-ground-floor',
      color: null,
      description: null,
      sortOrder: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(area.id).toBe('area-kitchen');
    expect(area.parentId).toBe('area-ground-floor');
    expect(area.color).toBeNull();
    expect(area.description).toBeNull();
    expect(area.sortOrder).toBe(1);
  });

  it('allows color and description to be null', () => {
    const area: AreaResponse = {
      id: 'area-minimal',
      name: 'Minimal Area',
      parentId: null,
      color: null,
      description: null,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(area.color).toBeNull();
    expect(area.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AreaListResponse interface
// ---------------------------------------------------------------------------

describe('AreaListResponse interface', () => {
  it('constructs a valid list response with multiple areas', () => {
    const response: AreaListResponse = {
      areas: [
        {
          id: 'area-1',
          name: 'Ground Floor',
          parentId: null,
          color: '#3B82F6',
          description: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'area-2',
          name: 'First Floor',
          parentId: null,
          color: '#EC4899',
          description: null,
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };

    expect(response.areas).toHaveLength(2);
    expect(response.areas[0].name).toBe('Ground Floor');
    expect(response.areas[1].name).toBe('First Floor');
  });

  it('handles empty area list', () => {
    const response: AreaListResponse = { areas: [] };
    expect(response.areas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AreaSingleResponse interface
// ---------------------------------------------------------------------------

describe('AreaSingleResponse interface', () => {
  it('wraps an AreaResponse in the area field', () => {
    const response: AreaSingleResponse = {
      area: {
        id: 'area-bathroom',
        name: 'Bathroom',
        parentId: 'area-ground-floor',
        color: '#8B5CF6',
        description: 'Main bathroom',
        sortOrder: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    };

    expect(response.area.id).toBe('area-bathroom');
    expect(response.area.name).toBe('Bathroom');
    expect(response.area.parentId).toBe('area-ground-floor');
  });
});

// ---------------------------------------------------------------------------
// CreateAreaRequest interface
// ---------------------------------------------------------------------------

describe('CreateAreaRequest interface', () => {
  it('requires only name — all other fields optional', () => {
    const request: CreateAreaRequest = {
      name: 'New Area',
    };

    expect(request.name).toBe('New Area');
    expect(request.parentId).toBeUndefined();
    expect(request.color).toBeUndefined();
    expect(request.description).toBeUndefined();
    expect(request.sortOrder).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const request: CreateAreaRequest = {
      name: 'Kitchen',
      parentId: 'area-ground-floor',
      color: '#FF5733',
      description: 'Main kitchen area',
      sortOrder: 1,
    };

    expect(request.name).toBe('Kitchen');
    expect(request.parentId).toBe('area-ground-floor');
    expect(request.color).toBe('#FF5733');
    expect(request.description).toBe('Main kitchen area');
    expect(request.sortOrder).toBe(1);
  });

  it('accepts null for nullable optional fields', () => {
    const request: CreateAreaRequest = {
      name: 'Top-Level Area',
      parentId: null,
      color: null,
      description: null,
    };

    expect(request.parentId).toBeNull();
    expect(request.color).toBeNull();
    expect(request.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UpdateAreaRequest interface
// ---------------------------------------------------------------------------

describe('UpdateAreaRequest interface', () => {
  it('allows empty update (all fields optional)', () => {
    const request: UpdateAreaRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });

  it('allows updating name only', () => {
    const request: UpdateAreaRequest = {
      name: 'Updated Kitchen',
    };

    expect(request.name).toBe('Updated Kitchen');
    expect(request.parentId).toBeUndefined();
    expect(request.color).toBeUndefined();
  });

  it('allows updating color and description', () => {
    const request: UpdateAreaRequest = {
      color: '#22C55E',
      description: 'Updated description',
    };

    expect(request.color).toBe('#22C55E');
    expect(request.description).toBe('Updated description');
  });

  it('allows clearing parentId, color, and description to null', () => {
    const request: UpdateAreaRequest = {
      parentId: null,
      color: null,
      description: null,
    };

    expect(request.parentId).toBeNull();
    expect(request.color).toBeNull();
    expect(request.description).toBeNull();
  });

  it('allows updating sortOrder', () => {
    const request: UpdateAreaRequest = { sortOrder: 5 };
    expect(request.sortOrder).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// AreaListQuery interface
// ---------------------------------------------------------------------------

describe('AreaListQuery interface', () => {
  it('accepts optional search parameter', () => {
    const query: AreaListQuery = { search: 'kitchen' };
    expect(query.search).toBe('kitchen');
  });

  it('allows empty query (all fields optional)', () => {
    const query: AreaListQuery = {};
    expect(Object.keys(query)).toHaveLength(0);
  });
});
