// AI provider abstraction for the parts assistant.
//
// The model is ONLY used to understand the customer's request (extract part,
// vehicle, year, condition, reference). It never produces product data:
// products, prices, stock and compatibility always come from the database
// (CatalogProvider → catalog_search), so the assistant cannot invent them.
//
// To add a provider: implement AiBackend, return it from getAiBackend() when its
// secrets are set, e.g.
//   supabase secrets set AI_PROVIDER=<name> AI_API_KEY=<key> [AI_MODEL=<model>]
// Keys stay in Supabase secrets; they are never sent to the browser.

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

/** Returns null while no AI provider is configured (the function then answers 503). */
export function getAiBackend(): AiBackend | null {
  const provider = Deno.env.get('AI_PROVIDER')
  const apiKey = Deno.env.get('AI_API_KEY')
  if (!provider || !apiKey) return null

  // No provider is implemented yet on purpose: choosing one (and its contract,
  // pricing and data-processing terms) is a business decision. Add the adapter
  // here, e.g. `if (provider === 'x') return createXBackend(apiKey, Deno.env.get('AI_MODEL'))`.
  console.warn(`AI_PROVIDER "${provider}" has no adapter yet`)
  return null
}
