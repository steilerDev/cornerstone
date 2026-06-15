/**
 * Type-level tests for shared orientation types.
 *
 * Verifies TypeScript interfaces for OrientationSummary, OrientationResponse,
 * OrientationListResponse, OrientationSingleResponse, and request/query types
 * (Story #1674: Mobile photo upload optimization).
 */

import { describe, it, expect } from '@jest/globals';
import type {
  OrientationSummary,
  OrientationResponse,
  OrientationListResponse,
  OrientationSingleResponse,
  CreateOrientationRequest,
  UpdateOrientationRequest,
  OrientationListQuery,
} from './orientation.js';

// ---------------------------------------------------------------------------
// OrientationSummary interface
// ---------------------------------------------------------------------------

describe('OrientationSummary interface', () => {
  it('constructs with all fields including non-null description', () => {
    const summary: OrientationSummary = {
      id: 'orient-1',
      name: 'South',
      description: 'Street-facing',
    };

    expect(summary.id).toBe('orient-1');
    expect(summary.name).toBe('South');
    expect(summary.description).toBe('Street-facing');
  });

  it('allows description to be null', () => {
    const summary: OrientationSummary = {
      id: 'orient-2',
      name: 'North',
      description: null,
    };

    expect(summary.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OrientationResponse interface
// ---------------------------------------------------------------------------

describe('OrientationResponse interface', () => {
  it('constructs with all fields and description null', () => {
    const response: OrientationResponse = {
      id: 'orient-3',
      name: 'East',
      description: null,
      sortOrder: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    expect(response.id).toBe('orient-3');
    expect(response.name).toBe('East');
    expect(response.description).toBeNull();
    expect(response.sortOrder).toBe(2);
    expect(response.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(response.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('does not have a color field', () => {
    const response: OrientationResponse = {
      id: 'orient-4',
      name: 'West',
      description: 'Garden-facing',
      sortOrder: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect((response as any).color).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OrientationListResponse interface
// ---------------------------------------------------------------------------

describe('OrientationListResponse interface', () => {
  it('wraps an array of OrientationResponse', () => {
    const orientations: OrientationResponse[] = [
      {
        id: 'orient-1',
        name: 'South',
        description: 'Street-facing',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'orient-2',
        name: 'North',
        description: null,
        sortOrder: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const listResponse: OrientationListResponse = { orientations };

    expect(listResponse.orientations).toHaveLength(2);
    expect(listResponse.orientations[0]!.id).toBe('orient-1');
    expect(listResponse.orientations[1]!.name).toBe('North');
  });

  it('accepts an empty orientations array', () => {
    const listResponse: OrientationListResponse = { orientations: [] };

    expect(listResponse.orientations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// OrientationSingleResponse interface
// ---------------------------------------------------------------------------

describe('OrientationSingleResponse interface', () => {
  it('wraps a single OrientationResponse', () => {
    const orientation: OrientationResponse = {
      id: 'orient-5',
      name: 'South-East',
      description: 'Corner-facing',
      sortOrder: 4,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    };
    const singleResponse: OrientationSingleResponse = { orientation };

    expect(singleResponse.orientation.id).toBe('orient-5');
    expect(singleResponse.orientation.name).toBe('South-East');
    expect(singleResponse.orientation.sortOrder).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// CreateOrientationRequest interface
// ---------------------------------------------------------------------------

describe('CreateOrientationRequest interface', () => {
  it('requires only name — all other fields optional', () => {
    const request: CreateOrientationRequest = {
      name: 'South',
    };

    expect(request.name).toBe('South');
    expect(request.description).toBeUndefined();
    expect(request.sortOrder).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const request: CreateOrientationRequest = {
      name: 'North',
      description: 'Garden-facing',
      sortOrder: 1,
    };

    expect(request.name).toBe('North');
    expect(request.description).toBe('Garden-facing');
    expect(request.sortOrder).toBe(1);
  });

  it('accepts null description', () => {
    const request: CreateOrientationRequest = {
      name: 'East',
      description: null,
    };

    expect(request.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UpdateOrientationRequest interface
// ---------------------------------------------------------------------------

describe('UpdateOrientationRequest interface', () => {
  it('allows empty update (all fields optional)', () => {
    const request: UpdateOrientationRequest = {};

    expect(Object.keys(request)).toHaveLength(0);
  });

  it('accepts any subset of fields', () => {
    const nameOnly: UpdateOrientationRequest = { name: 'Updated North' };
    const descOnly: UpdateOrientationRequest = { description: 'New description' };
    const sortOnly: UpdateOrientationRequest = { sortOrder: 5 };
    const allFields: UpdateOrientationRequest = { name: 'West', description: null, sortOrder: 3 };

    expect(nameOnly.name).toBe('Updated North');
    expect(descOnly.description).toBe('New description');
    expect(sortOnly.sortOrder).toBe(5);
    expect(allFields.name).toBe('West');
    expect(allFields.description).toBeNull();
    expect(allFields.sortOrder).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// OrientationListQuery interface
// ---------------------------------------------------------------------------

describe('OrientationListQuery interface', () => {
  it('accepts search param', () => {
    const query: OrientationListQuery = { search: 'south' };

    expect(query.search).toBe('south');
  });

  it('allows empty query', () => {
    const query: OrientationListQuery = {};

    expect(Object.keys(query)).toHaveLength(0);
  });
});
