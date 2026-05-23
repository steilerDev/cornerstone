/**
 * Unit tests for providerProfiles.ts — provider detection, env parsing,
 * and per-provider request body shaping.
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectProvider,
  parseProviderEnv,
  buildRequestBody,
  LLM_PROVIDERS,
} from './providerProfiles.js';

describe('detectProvider', () => {
  it.each([
    ['https://api.anthropic.com/v1', 'anthropic'],
    ['https://api.anthropic.com/v1/', 'anthropic'],
    ['https://api.openai.com/v1', 'openai'],
    ['https://api.openai.com/v1/', 'openai'],
    [
      'https://generativelanguage.googleapis.com/v1beta/openai',
      'gemini',
    ],
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
    expect(body.max_tokens).toBe(4096);
  }

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

  it('anthropic → response_format: json_schema with full ExtractedLine schema', () => {
    const body = buildRequestBody({ ...common, provider: 'anthropic' });
    assertBaseFields(body);
    const rf = body.response_format as { type: string; json_schema: { name: string; schema: { properties: { lines: unknown } } } };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.name).toBe('extracted_lines');
    // Schema must allow our optional fields with type unions; we don't snapshot the full
    // shape (brittle) but verify the top-level lines array is declared.
    expect(rf.json_schema.schema.properties.lines).toBeDefined();
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
});
