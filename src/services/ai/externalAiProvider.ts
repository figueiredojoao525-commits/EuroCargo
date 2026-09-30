import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabase'
import { AiNotConfiguredError, type AiProvider, type AskOptions, type AssistantAnswer } from './types'

/**
 * Calls the `ai-assistant` Edge Function, which holds the AI provider key as a
 * Supabase secret. The function must answer only with catalogue data it fetched
 * itself (see supabase/functions/ai-assistant). Until an AI provider is
 * configured it answers 503 and the app uses the local assistant instead.
 */
export const externalAiProvider: AiProvider = {
  name: 'external',

  async ask(query: string, options: AskOptions): Promise<AssistantAnswer> {
    const { data, error } = await getSupabase().functions.invoke<AssistantAnswer>('ai-assistant', {
      body: { query, lang: options.lang, conversation_id: options.conversationId ?? null },
    })
    if (error) {
      const status = error instanceof FunctionsHttpError ? error.context.status : 0
      if (status === 0 || status === 404 || status === 503) throw new AiNotConfiguredError()
      throw error
    }
    if (!data) throw new AiNotConfiguredError()
    return data
  },
}
