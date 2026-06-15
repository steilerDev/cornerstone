/**
 * Provider-specific request shaping for the OpenAI-compatible LLM gateway.
 *
 * Different providers diverge in subtle ways on the otherwise-canonical
 * `/v1/chat/completions` schema:
 *
 *  - OpenAI:    accepts `response_format: { type: 'json_object' }`. `max_tokens` optional.
 *               Sends `reasoning_effort: 'none'` only for reasoning models (o1/o3/o4/gpt-5 series)
 *               to disable chain-of-thought; non-reasoning models reject the field with HTTP 400.
 *  - Anthropic: rejects `json_object`; requires `json_schema` with a real schema.
 *               `max_tokens` always required on the native API; the OpenAI-compat
 *               layer is more lenient but we send it for consistency.
 *               Thinking is disabled by default; no `reasoning_effort` field sent.
 *  - Gemini:    accepts `json_object` and `json_schema`. `max_tokens` honored as a hint.
 *               Sends `reasoning_effort: 'none'` to disable dynamic thinking (Gemini 2.5 Flash).
 *  - Ollama:    accepts `json_object` for models that support structured output;
 *               older models silently ignore it. Sends `reasoning_effort: 'none'` (safely
 *               ignored on non-thinking models).
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
 * `ExtractionResult` shape validated at parse time by `validateExtractedLines`.
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
      invoiceDate: { type: ['string', 'null'] },
      dueDate: { type: ['string', 'null'] },
      invoiceNumber: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
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
            'vendorName',
            'confidence',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['invoiceDate', 'dueDate', 'invoiceNumber', 'notes', 'lines'],
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
  /**
   * Maximum output tokens. Optional — falls back to `DEFAULT_MAX_TOKENS`
   * (16384) when omitted. Operator override exposed via `LLM_MAX_TOKENS`.
   */
  maxTokens?: number;
}

/**
 * Returns true when the model name matches an OpenAI reasoning model.
 *
 * Reasoning models (o1, o3, o4 series, codex-mini, gpt-5 series) accept
 * `reasoning_effort` and benefit from `"none"` to disable chain-of-thought
 * for structured extraction. Non-reasoning models (gpt-4o, gpt-4o-mini,
 * gpt-4-turbo, etc.) reject the field with HTTP 400.
 *
 * Pattern is intentionally conservative: false negatives (sending nothing
 * to an unrecognized o-series variant) are safe. False positives would
 * cause a 400 on a non-reasoning model.
 */
export function isOpenAiReasoningModel(model: string): boolean {
  const m = model.toLowerCase().trim();
  return (
    /^o[134](-|$)/.test(m) ||  // o1, o1-mini, o1-preview, o3, o3-mini, o4-mini
    m.startsWith('gpt-5') ||    // gpt-5, gpt-5.5, gpt-5.4-mini, etc.
    m.includes('codex-mini')    // codex-mini (reasoning variant)
  );
}

/**
 * Build the request body for the configured provider.
 *
 * All providers receive `model`, `messages`, `temperature: 0`, and `max_tokens`.
 * Structured-output hints (`response_format`) and thinking-disable fields
 * (`reasoning_effort: 'none'`) vary by provider.
 */
export function buildRequestBody(input: RequestBodyInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    temperature: 0,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  switch (input.provider) {
    case 'openai':
      return {
        ...base,
        response_format: { type: 'json_object' },
        ...(isOpenAiReasoningModel(input.model) ? { reasoning_effort: 'none' } : {}),
      };
    case 'gemini':
      return {
        ...base,
        response_format: { type: 'json_object' },
        reasoning_effort: 'none',
      };
    case 'ollama':
      return {
        ...base,
        response_format: { type: 'json_object' },
        reasoning_effort: 'none',
      };
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
