// AI provider abstraction for the parts assistant.
//
// The model is ONLY used to understand the customer's request (extract part,
// vehicle, year, engine, condition, reference / OE). It never produces product data:
// products, prices, stock and compatibility always come from the database
// (CatalogProvider → catalog_search), so the assistant cannot invent them.
//
// Configure (keys stay in Supabase secrets; they are never sent to the browser):
//   supabase secrets set AI_PROVIDER=anthropic AI_API_KEY=<key> [AI_MODEL=<model id>]
//   supabase functions deploy ai-assistant
import Anthropic from 'npm:@anthropic-ai/sdk'

export interface ParsedRequest {
  /** Part description words to search for (in the catalogue's language). */
  text: string
  make?: string
  model?: string
  year?: number
  condition?: 'new' | 'used'
  reference?: string
  /** Original-equipment number, when the customer gives one ("OE 123…"). */
  oe?: string
  /** Engine family / code ("hdi", "9HZ"), fuel and size in cc ("1.6" → 1600). */
  engine?: string
  fuel?: 'petrol' | 'diesel' | 'hybrid' | 'electric' | 'lpg' | 'other'
  engineCc?: number
}

export interface AiBackend {
  name: string
  interpret(query: string, lang: string, known: { makes: string[]; models: string[] }): Promise<ParsedRequest>
}

/** The model could not or would not interpret the request (the caller falls back / answers 502). */
export class AiInterpretError extends Error {}

const FUELS = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other', ''] as const

// Every field is required; "" / 0 mean "not given" (simple, fully supported schema).
const REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'make', 'model', 'year', 'condition', 'reference', 'oe', 'engine', 'fuel', 'engine_cc'],
  properties: {
    text: { type: 'string', description: 'Part words only, in Portuguese (e.g. "pastilhas de travão dianteiras"). "" if none.' },
    make: { type: 'string', description: 'Vehicle make exactly as in the known list, or "".' },
    model: { type: 'string', description: 'Vehicle model exactly as in the known list, or "".' },
    year: { type: 'integer', description: 'Model year, or 0.' },
    condition: { type: 'string', enum: ['new', 'used', ''] },
    reference: { type: 'string', description: 'Manufacturer part number the customer typed, or "".' },
    oe: { type: 'string', description: 'Original-equipment (OE/OEM) number the customer typed, or "".' },
    engine: { type: 'string', description: 'Engine family or code as typed (e.g. "hdi", "tdi", "9HZ"), or "".' },
    fuel: { type: 'string', enum: [...FUELS] },
    engine_cc: { type: 'integer', description: 'Engine size in cc ("1.6" → 1600), or 0.' },
  },
} as const

const SYSTEM = [
  'You read requests for car parts sent to an online parts shop and turn them into search fields.',
  'Only extract what the customer wrote: never guess a vehicle, year, engine or reference that is not in the text.',
  'make and model must be copied exactly from the known lists when they match; otherwise leave them empty.',
  'Write "text" in Portuguese, with only the part words (no vehicle, year, engine or reference).',
  'Requests may be in Portuguese, Spanish, English, French, German or Italian.',
].join(' ')

function createAnthropicBackend(apiKey: string, model: string): AiBackend {
  // Short timeout: the website falls back to its catalogue search when this fails.
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })

  return {
    name: `anthropic:${model}`,
    async interpret(query, lang, known) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 1024,
        // Re-runs the request on a fallback model if the primary declines (policy refusal).
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: REQUEST_SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content:
              `Site language: ${lang}\n` +
              `Known makes: ${known.makes.join(', ')}\n` +
              `Known models: ${known.models.slice(0, 400).join(', ')}\n\n` +
              `Customer request:\n${query}`,
          },
        ],
      })

      if (response.stop_reason === 'refusal') throw new AiInterpretError('ai_refusal')
      if (response.stop_reason === 'max_tokens') throw new AiInterpretError('ai_truncated')
      const block = response.content.find((b) => b.type === 'text')
      if (!block || block.type !== 'text') throw new AiInterpretError('ai_no_output')

      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(block.text)
      } catch {
        throw new AiInterpretError('ai_invalid_json')
      }
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined)
      const int = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : undefined)
      const fuel = FUELS.find((f) => f && f === raw.fuel)
      return {
        text: str(raw.text) ?? '',
        make: str(raw.make),
        model: str(raw.model),
        year: int(raw.year),
        condition: raw.condition === 'new' || raw.condition === 'used' ? raw.condition : undefined,
        reference: str(raw.reference),
        oe: str(raw.oe),
        engine: str(raw.engine),
        fuel: fuel || undefined,
        engineCc: int(raw.engine_cc),
      }
    },
  }
}

/** Returns null while no AI provider is configured (the function then answers 503). */
export function getAiBackend(): AiBackend | null {
  const provider = Deno.env.get('AI_PROVIDER')?.trim()
  const apiKey = Deno.env.get('AI_API_KEY')?.trim()
  if (!provider || !apiKey) return null
  if (provider === 'anthropic') return createAnthropicBackend(apiKey, Deno.env.get('AI_MODEL')?.trim() || 'claude-opus-5-5')
  console.warn(`AI_PROVIDER "${provider}" has no adapter`)
  return null
}
