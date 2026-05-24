/**
 * Provider-specific request shaping for the OpenAI-compatible LLM gateway.
 *
 * Different providers diverge in subtle ways on the otherwise-canonical
 * `/v1/chat/completions` schema:
 *
 *  - OpenAI:    accepts `response_format: { type: 'json_object' }`. `max_tokens` optional.
 *  - Anthropic: rejects `json_object`; requires `json_schema` with a real schema.
 *               `max_tokens` always required on the native API; the OpenAI-compat
 *               layer is more lenient but we send it for consistency.
 *  - Gemini:    accepts `json_object` and `json_schema`. `max_tokens` honored as a hint.
 *  - Ollama:    accepts `json_object` for models that support structured output;
 *               older models silently ignore it.
 *  - Generic:   unknown provider — send the minimum body and rely on the system
 *               prompt's "Output ONLY valid JSON" rule plus runtime validation.
 *
 * `detectProvider()` sniffs the base URL and is overridden by `LLM_PROVIDER` env var.
 */

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'generic';

export const LLM_PROVIDERS: readonly LlmProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'generic',
] as const;

/**
 * JSON schema for the response Anthropic must conform to. Mirrors the
 * `ExtractedLine[]` shape validated at parse time by `validateExtractedLines`.
 * Anthropic's OpenAI-compat layer requires this when `response_format.type`
 * is `'json_schema'`.
 */
// Anthropic's OpenAI-compat layer requires `strict: true` (Input must literally
// be `true`, not `false`). OpenAI's structured-outputs spec — which Anthropic
// mirrors — imposes additional rules when `strict: true`:
//   1. `additionalProperties: false` must be set on every object schema
//   2. EVERY property must be listed in `required` (optional fields use
//      union-typed nulls: `type: ['number', 'null']`)
// Our `validateExtractedLines` already tolerates null for the optional fields,
// so the LLM emitting `quantity: null` instead of omitting it is fine.
const EXTRACTED_LINES_SCHEMA = {
  name: 'extracted_lines',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            unitPrice: { type: ['number', 'null'] },
            totalAmount: { type: 'number' },
            includesVat: { type: ['boolean', 'null'] },
            vatRate: { type: ['number', 'null'] },
            vendorName: { type: ['string', 'null'] },
            confidence: { type: 'number' },
          },
          required: [
            'description',
            'quantity',
            'unit',
            'unitPrice',
            'totalAmount',
            'includesVat',
            'vatRate',
            'vendorName',
            'confidence',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['lines'],
    additionalProperties: false,
  },
} as const;

// Output cap. A typical German construction invoice has 20–60 line items,
// each ~200–400 chars of JSON, so ~10–25K output chars ≈ 3–8K tokens. Many
// real-world invoices exceed this (one Göbel Farbwerk invoice was 40+ lines
// with verbose descriptions and truncated at 4096). 16384 handles 100+ lines
// comfortably and stays under every supported provider's max output:
//   - Anthropic Haiku: 64K output
//   - OpenAI gpt-4o-mini: 16K output (this is the binding constraint)
//   - Gemini 2.5 Flash: 65K output
//   - Ollama: model-dependent, typically 4–32K
// Truncation surfaces as LLM_INVALID_RESPONSE with a JSON parse error in
// details — we also check `finish_reason: 'length'` for a clearer signal.
const DEFAULT_MAX_TOKENS = 16384;

/**
 * Infer the provider from a base URL. Returns 'generic' when the URL doesn't
 * match a known provider — caller is expected to fall back to env override.
 */
export function detectProvider(baseUrl: string): LlmProvider {
  const url = baseUrl.toLowerCase();
  if (url.includes('api.anthropic.com')) return 'anthropic';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  // Ollama default port and common service names
  if (url.includes(':11434') || /\bollama\b/.test(url)) return 'ollama';
  return 'generic';
}

/**
 * Normalize an env-var value into a known provider, or return undefined when
 * unset/empty so the caller can fall back to auto-detection.
 */
export function parseProviderEnv(value: string | undefined): LlmProvider | undefined {
  if (!value || value.trim() === '') return undefined;
  const v = value.trim().toLowerCase();
  if ((LLM_PROVIDERS as readonly string[]).includes(v)) return v as LlmProvider;
  return undefined;
}

export interface RequestBodyInput {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Build the request body for the configured provider.
 *
 * All providers receive `model`, `messages`, `temperature: 0`, and `max_tokens`.
 * Only the structured-output hint (`response_format`) varies.
 */
export function buildRequestBody(input: RequestBodyInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    temperature: 0,
    max_tokens: DEFAULT_MAX_TOKENS,
  };

  switch (input.provider) {
    case 'openai':
    case 'gemini':
    case 'ollama':
      return { ...base, response_format: { type: 'json_object' } };
    case 'anthropic':
      return {
        ...base,
        response_format: { type: 'json_schema', json_schema: EXTRACTED_LINES_SCHEMA },
      };
    case 'generic':
    default:
      // No structured-output hint. The system prompt mandates strict JSON and
      // `validateExtractedLines` rejects anything malformed at parse time.
      return base;
  }
}
