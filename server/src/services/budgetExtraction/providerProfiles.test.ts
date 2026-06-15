/**
 * Unit tests for providerProfiles.ts — provider detection, env parsing,
 * and per-provider request body shaping.
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectProvider,
  parseProviderEnv,
  buildRequestBody,
  isOpenAiReasoningModel,
  LLM_PROVIDERS,
} from './providerProfiles.js';

describe('detectProvider', () => {
  it.each([
    ['https://api.anthropic.com/v1', 'anthropic'],
    ['https://api.anthropic.com/v1/', 'anthropic'],
    ['https://api.openai.com/v1', 'openai'],
    ['https://api.openai.com/v1/', 'openai'],
    ['https://generativelanguage.googleapis.com/v1beta/openai', 'gemini'],
    ['http://ollama:11434/v1', 'ollama'],
    ['http://localhost:11434/v1', 'ollama'],
    ['http://my-host:11434', 'ollama'],
    ['https://openrouter.ai/api/v1', 'generic'],
    ['https://my-litellm.example.com', 'generic'],
  ] as const)('detects %s -> %s', (url, expected) => {
    expect(detectProvider(url)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(detectProvider('https://API.ANTHROPIC.com/v1')).toBe('anthropic');
  });
});

describe('parseProviderEnv', () => {
  it('returns undefined for unset/empty', () => {
    expect(parseProviderEnv(undefined)).toBeUndefined();
    expect(parseProviderEnv('')).toBeUndefined();
    expect(parseProviderEnv('   ')).toBeUndefined();
  });

  it.each(LLM_PROVIDERS)('accepts known provider %s', (p) => {
    expect(parseProviderEnv(p)).toBe(p);
    expect(parseProviderEnv(p.toUpperCase())).toBe(p);
    expect(parseProviderEnv(`  ${p}  `)).toBe(p);
  });

  it('returns undefined for unknown value (caller falls back to auto-detect)', () => {
    expect(parseProviderEnv('claude')).toBeUndefined();
    expect(parseProviderEnv('gpt')).toBeUndefined();
    expect(parseProviderEnv('bedrock')).toBeUndefined();
  });
});

describe('buildRequestBody', () => {
  const common = {
    model: 'test-model',
    systemPrompt: 'sys',
    userPrompt: 'user',
  };

  function assertBaseFields(body: Record<string, unknown>) {
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ]);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(16384);
  }

  it('honors the maxTokens override (operator-configurable cap)', () => {
    const body = buildRequestBody({ ...common, provider: 'openai', maxTokens: 32000 });
    expect(body.max_tokens).toBe(32000);
  });

  it('falls back to default max_tokens when override is omitted', () => {
    const body = buildRequestBody({ ...common, provider: 'openai' });
    expect(body.max_tokens).toBe(16384);
  });

  it('openai → response_format: json_object', () => {
    const body = buildRequestBody({ ...common, provider: 'openai' });
    assertBaseFields(body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('gemini → response_format: json_object', () => {
    const body = buildRequestBody({ ...common, provider: 'gemini' });
    assertBaseFields(body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('ollama → response_format: json_object', () => {
    const body = buildRequestBody({ ...common, provider: 'ollama' });
    assertBaseFields(body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('anthropic → response_format: json_schema with strict mode + full ExtractedLine schema', () => {
    const body = buildRequestBody({ ...common, provider: 'anthropic' });
    assertBaseFields(body);
    const rf = body.response_format as {
      type: string;
      json_schema: {
        name: string;
        strict: boolean;
        schema: {
          type: string;
          required: string[];
          additionalProperties: boolean;
          properties: Record<string, unknown> & {
            lines: {
              type: string;
              items: {
                type: string;
                required: string[];
                additionalProperties: boolean;
                properties: Record<string, unknown>;
              };
            };
          };
        };
      };
    };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.name).toBe('extracted_lines');
    // Anthropic requires strict: true (the original strict: false produced a 400).
    expect(rf.json_schema.strict).toBe(true);
    // strict mode requires additionalProperties: false on every object node.
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(rf.json_schema.schema.properties.lines.items.additionalProperties).toBe(false);

    // Story #1581: top-level schema now includes invoiceDate, dueDate, invoiceNumber, notes.
    expect(rf.json_schema.schema.required).toEqual(
      expect.arrayContaining(['invoiceDate', 'dueDate', 'invoiceNumber', 'notes', 'lines']),
    );

    // Top-level properties include all four document-level fields.
    const topLevelProps = Object.keys(rf.json_schema.schema.properties);
    expect(topLevelProps).toContain('invoiceDate');
    expect(topLevelProps).toContain('dueDate');
    expect(topLevelProps).toContain('invoiceNumber');
    expect(topLevelProps).toContain('notes');

    // strict mode requires EVERY property to be listed in `required` (optional
    // fields use union-typed nulls). vatRate was REMOVED from the line schema in #1581.
    expect(rf.json_schema.schema.properties.lines.items.required).toEqual(
      expect.arrayContaining([
        'description',
        'quantity',
        'unit',
        'unitPrice',
        'totalAmount',
        'includesVat',
        'vendorName',
        'confidence',
      ]),
    );

    // vatRate must NOT be in the line items required array (Story #1581 removal).
    expect(rf.json_schema.schema.properties.lines.items.required).not.toContain('vatRate');

    // vatRate must NOT be in the line items properties (Story #1581 removal).
    expect(rf.json_schema.schema.properties.lines.items.properties).not.toHaveProperty('vatRate');
  });

  it('generic → no response_format hint', () => {
    const body = buildRequestBody({ ...common, provider: 'generic' });
    assertBaseFields(body);
    expect(body.response_format).toBeUndefined();
  });

  it('all profiles produce JSON-serializable bodies', () => {
    for (const provider of LLM_PROVIDERS) {
      const body = buildRequestBody({ ...common, provider });
      expect(() => JSON.stringify(body)).not.toThrow();
    }
  });

  describe('thinking-disable (reasoning_effort) per provider', () => {
    it('gemini → reasoning_effort is "none"', () => {
      const body = buildRequestBody({ ...common, provider: 'gemini' });
      expect(body.reasoning_effort).toBe('none');
    });

    it('gemini → response_format is still json_object (unchanged)', () => {
      const body = buildRequestBody({ ...common, provider: 'gemini' });
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('ollama → reasoning_effort is "none"', () => {
      const body = buildRequestBody({ ...common, provider: 'ollama' });
      expect(body.reasoning_effort).toBe('none');
    });

    it('ollama → response_format is still json_object (unchanged)', () => {
      const body = buildRequestBody({ ...common, provider: 'ollama' });
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('openai + non-reasoning model (gpt-4o) → reasoning_effort key is absent', () => {
      const body = buildRequestBody({ ...common, model: 'gpt-4o', provider: 'openai' });
      expect('reasoning_effort' in body).toBe(false);
    });

    it('openai + non-reasoning model (gpt-4o) → response_format still json_object', () => {
      const body = buildRequestBody({ ...common, model: 'gpt-4o', provider: 'openai' });
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('openai + reasoning model (o3-mini) → reasoning_effort is "low"', () => {
      const body = buildRequestBody({ ...common, model: 'o3-mini', provider: 'openai' });
      expect(body.reasoning_effort).toBe('low');
    });

    it('openai + reasoning model (o3-mini) → response_format still json_object', () => {
      const body = buildRequestBody({ ...common, model: 'o3-mini', provider: 'openai' });
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('openai + reasoning model (gpt-5) → reasoning_effort is "low"', () => {
      const body = buildRequestBody({ ...common, model: 'gpt-5', provider: 'openai' });
      expect(body.reasoning_effort).toBe('low');
    });

    it('openai + existing test-model fixture is not a reasoning model → reasoning_effort key absent', () => {
      // Confirms the pre-existing "openai → response_format: json_object" test remains valid.
      const body = buildRequestBody({ ...common, provider: 'openai' }); // model: 'test-model'
      expect('reasoning_effort' in body).toBe(false);
    });

    it('anthropic → reasoning_effort key is absent', () => {
      const body = buildRequestBody({ ...common, provider: 'anthropic' });
      expect('reasoning_effort' in body).toBe(false);
    });

    it('anthropic → response_format is json_schema with EXTRACTED_LINES_SCHEMA (unchanged)', () => {
      const body = buildRequestBody({ ...common, provider: 'anthropic' });
      const rf = body.response_format as { type: string; json_schema: { name: string } };
      expect(rf.type).toBe('json_schema');
      expect(rf.json_schema.name).toBe('extracted_lines');
    });

    it('generic → reasoning_effort key is absent', () => {
      const body = buildRequestBody({ ...common, provider: 'generic' });
      expect('reasoning_effort' in body).toBe(false);
    });
  });
});

describe('isOpenAiReasoningModel', () => {
  it.each([
    ['o1', true],
    ['o1-mini', true],
    ['o1-preview', true],
    ['o3', true],
    ['o3-mini', true],
    ['o4-mini', true],
    ['gpt-5', true],
    ['gpt-5.5', true],
    ['gpt-5.4-mini', true],
    ['codex-mini', true],
    ['O1-MINI', true], // uppercase — case-insensitive
  ] as const)('returns true for reasoning model %s', (model, expected) => {
    expect(isOpenAiReasoningModel(model)).toBe(expected);
  });

  it.each([
    ['gpt-4o', false],
    ['gpt-4o-mini', false],
    ['gpt-4-turbo', false],
    ['gpt-3.5-turbo', false],
    ['claude-3-haiku-20240307', false],
    ['gemini-2.5-flash', false],
    ['test-model', false], // the fixture used in existing buildRequestBody tests
  ] as const)('returns false for non-reasoning model %s', (model, expected) => {
    expect(isOpenAiReasoningModel(model)).toBe(expected);
  });
});
