import { externalAiProvider } from './externalAiProvider'
import { localCatalogAssistant, logExchange } from './localCatalogAssistant'
import { AiNotConfiguredError, type AiProvider, type AskOptions, type AssistantAnswer } from './types'

export type { AnswerKind, AssistantAnswer } from './types'
export type { ParsedQuery } from './queryParser'

/**
 * VITE_AI_PROVIDER=external tries the Edge Function first and falls back to the
 * local catalogue assistant while no AI provider is configured. Default: local.
 */
const useExternal = import.meta.env.VITE_AI_PROVIDER === 'external'

export const aiProvider: AiProvider = {
  name: useExternal ? 'external+local' : 'local',
  async ask(query: string, options: AskOptions): Promise<AssistantAnswer> {
    let answer: AssistantAnswer
    if (useExternal) {
      try {
        answer = await externalAiProvider.ask(query, options)
      } catch (error) {
        if (!(error instanceof AiNotConfiguredError)) throw error
        answer = await localCatalogAssistant.ask(query, options)
      }
    } else {
      answer = await localCatalogAssistant.ask(query, options)
    }
    // The external function logs server-side; local answers are logged from here.
    if (answer.provider === 'local') answer.logged = logExchange(query, answer)
    return answer
  },
}
