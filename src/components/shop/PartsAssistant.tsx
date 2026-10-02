import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import { aiProvider, type AssistantAnswer } from '../../services/ai'
import { cart } from '../../services/cart'
import { getErrorMessage } from '../../services/errors'
import type { CatalogItem } from '../../types'
import { compatibilityLabel, localized } from '../../utils/catalog'
import { illustrativeKey } from '../../utils/productImage'
import { Alert } from '../Alert'
import { Icon } from '../Icon'
import { AvailabilityBadge, ConditionBadge, DemoBadge, PriceDisplay } from './Badges'
import { ContactSpecialist } from './ContactSpecialist'
import { ProductImage } from './ProductImage'

type Message =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; answer: AssistantAnswer }
  | { id: number; role: 'error'; text: string }

/** Items of the same part (new / used) side by side. */
function groupItems(items: CatalogItem[]): CatalogItem[][] {
  const groups = new Map<string, CatalogItem[]>()
  for (const item of items) {
    const key = item.group_key ?? item.id
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const rank = (item: CatalogItem) => (item.condition === 'new' ? 0 : 1)
  return [...groups.values()].map((group) => group.sort((a, b) => rank(a) - rank(b)))
}

// The conversation survives page changes during the visit (product → back to the shop).
const HISTORY_KEY = 'eurocargo_assistant'

function loadHistory(): { messages: Message[]; conversationId: string | null } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? 'null')
    if (saved && Array.isArray(saved.messages)) return { messages: saved.messages.slice(-30), conversationId: saved.conversationId ?? null }
  } catch {
    // Unavailable storage: start empty.
  }
  return { messages: [], conversationId: null }
}

/** Fixed, true answers to questions about the shop (prices, stock, DEMO data, orders). */
function InfoView({ info }: { info: NonNullable<AssistantAnswer['info']> }) {
  const { t } = useI18n()
  const { catalog, topics } = info
  const counts = catalog && { real: String(catalog.real), demo: String(catalog.demo) }
  // The catalogue status answers "is it real?"; it is also shown whenever nothing real is on sale.
  const status =
    !catalog
      ? t.assistant.info.unknown
      : catalog.real === 0
        ? catalog.demo > 0
          ? interpolate(t.assistant.info.allDemo, counts!)
          : t.assistant.info.empty
        : catalog.demo > 0
          ? interpolate(t.assistant.info.mixed, counts!)
          : interpolate(t.assistant.info.noDemo, counts!)
  const showStatus = topics.includes('demo') || (catalog !== null && catalog.real === 0)
  return (
    <div className="assistant-info">
      {showStatus && <p>{status}</p>}
      {topics.includes('prices') && <p>{t.assistant.info.prices}</p>}
      {topics.includes('availability') && <p>{t.assistant.info.availability}</p>}
      {topics.includes('orders') && <p>{t.assistant.info.orders}</p>}
    </div>
  )
}

function AnswerView({ answer }: { answer: AssistantAnswer }) {
  const { t, lang } = useI18n()
  const { parsed } = answer
  const [added, setAdded] = useState<string | null>(null)
  const vehicle = [parsed.make?.name, parsed.model?.name].filter(Boolean).join(' ')
  const understood = [
    parsed.text,
    vehicle,
    parsed.year,
    [parsed.engineCc && (parsed.engineCc / 1000).toFixed(1), parsed.engine?.toUpperCase()].filter(Boolean).join(' '),
    parsed.fuel && t.fuel[parsed.fuel],
    parsed.condition && t.condition[parsed.condition],
    parsed.reference && `${t.shop.ref} ${parsed.reference}`,
    parsed.oe && `${t.shop.oe} ${parsed.oe}`,
  ].filter(Boolean)

  // A question about the shop with no part to look for: no search summary or part request.
  const infoOnly = Boolean(answer.info && !answer.info.searched)
  const summary =
    answer.kind === 'confirmed'
      ? interpolate(t.assistant.confirmed, { count: String(answer.items.length) })
      : answer.kind === 'related'
        ? answer.vehicleRelaxed
          ? interpolate(t.assistant.otherVehicles, { vehicle: [vehicle, parsed.year].filter(Boolean).join(' ') })
          : t.assistant.related
        : t.assistant.none

  return (
    <div className="assistant-answer">
      {understood.length > 0 && !infoOnly && (
        <p className="assistant-understood">
          <strong>{t.assistant.understood}</strong> {understood.join(' · ')}
        </p>
      )}
      {answer.notice === 'externalUnavailable' && <Alert tone="info">{t.assistant.externalUnavailable}</Alert>}
      {parsed.unsupported && <Alert tone="info">{t.assistant.unsupported[parsed.unsupported]}</Alert>}
      {answer.info && <InfoView info={answer.info} />}
      {infoOnly ? <p className="muted small">{t.assistant.info.searchHint}</p> : <p>{summary}</p>}
      {answer.question && <p className="assistant-question">{t.assistant.questions[answer.question]}</p>}

      {answer.items.length > 0 && (
        <ul className="assistant-results">
          {groupItems(answer.items).map((group) => {
            const first = group[0]
            const compat = first.compatibility[0]
            return (
              <li key={first.group_key ?? first.id} className="assistant-result">
                <div className="assistant-result-image">
                  <ProductImage
                    url={first.image}
                    illustrativeKey={illustrativeKey(first.category?.slug, first.name)}
                    categorySlug={first.category?.slug}
                    size="sm"
                    sizes="64px"
                  />
                </div>
                <div className="assistant-result-head">
                  <strong>{localized(first.name, first.name_i18n, lang)}</strong>
                  {first.is_demo && <DemoBadge />}
                </div>
                <p className="muted small">
                  {[first.brand, compat && compatibilityLabel(compat)].filter(Boolean).join(' · ')}
                </p>
                <div className="assistant-options">
                  {group.map((item) => (
                    <div key={item.id} className="assistant-option-row">
                      <Link to={`/pecas/${item.id}`} className="assistant-option">
                        <ConditionBadge condition={item.condition} />
                        <PriceDisplay price={item.price} currency={item.currency} isDemo={item.is_demo} />
                        <AvailabilityBadge availability={item.availability} leadTimeDays={item.lead_time_days} />
                        {item.part_number && (
                          <span className="muted small mono">
                            {t.shop.ref} {item.part_number}
                          </span>
                        )}
                      </Link>
                      {item.availability !== 'out_of_stock' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            cart.add(item.id, 1)
                            setAdded(item.id)
                          }}
                        >
                          <Icon name="cart" size={14} />
                          {item.price === null ? t.shop.requestQuote : t.shop.addToRequest}
                        </button>
                      )}
                      {added === item.id && (
                        <Link to="/carrinho" className="small">
                          {t.shop.viewRequest}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {answer.kind !== 'confirmed' && !infoOnly && (
        <p className="small">
          <Link
            to={`/carrinho?${new URLSearchParams({
              message: interpolate(t.shop.requestPartMessage, { query: parsed.original }),
              ...(vehicle ? { vehicle: [vehicle, parsed.year].filter(Boolean).join(' ') } : {}),
            }).toString()}`}
          >
            {t.shop.requestPart}
          </Link>
        </p>
      )}
      {answer.kind !== 'confirmed' && (
        <ContactSpecialist
          compact
          context={{
            product: parsed.text || undefined,
            vehicle: vehicle || undefined,
            year: parsed.year,
            reference: parsed.reference,
            condition: parsed.condition,
            question: parsed.original,
          }}
        />
      )}
    </div>
  )
}

export function PartsAssistant() {
  const { t, lang } = useI18n()
  const [initial] = useState(loadHistory)
  const [messages, setMessages] = useState<Message[]>(initial.messages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const conversationId = useRef<string | null>(initial.conversationId)
  const nextId = useRef(initial.messages.reduce((max, m) => Math.max(max, m.id), 0) + 1)

  useEffect(() => {
    try {
      // Only what the answers need to be shown again (no promises).
      const clean = messages.map((m) => (m.role === 'assistant' ? { ...m, answer: { ...m.answer, logged: undefined } } : m))
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify({ messages: clean, conversationId: conversationId.current }))
    } catch {
      // Storage unavailable: history lasts for this page view only.
    }
  }, [messages])

  function reset() {
    setMessages([])
    conversationId.current = null
  }
  const logRef = useRef<HTMLDivElement>(null)

  async function ask(text: string) {
    const query = text.trim()
    if (!query || busy) return
    setInput('')
    setBusy(true)
    setMessages((m) => [...m, { id: nextId.current++, role: 'user', text: query }])
    try {
      const answer = await aiProvider.ask(query, { lang, conversationId: conversationId.current })
      answer.logged?.then((id) => {
        if (id) conversationId.current = id
      })
      setMessages((m) => [...m, { id: nextId.current++, role: 'assistant', answer }])
    } catch (error) {
      setMessages((m) => [...m, { id: nextId.current++, role: 'error', text: getErrorMessage(error, t) }])
    } finally {
      setBusy(false)
      requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }))
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    ask(input)
  }

  return (
    <section className="assistant card" aria-labelledby="assistant-title">
      <header className="assistant-header">
        <span className="assistant-avatar" aria-hidden="true">
          <Icon name="sparkle" size={20} />
        </span>
        <div>
          <h2 id="assistant-title">{t.assistant.title}</h2>
          <p className="muted small">{t.assistant.subtitle}</p>
        </div>
      </header>

      <div className="assistant-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="assistant-intro">
            <p>{t.assistant.intro}</p>
            <div className="assistant-examples">
              {t.assistant.examples.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => ask(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="bubble bubble-user">
                {message.text}
              </div>
            ) : message.role === 'error' ? (
              <div key={message.id} className="bubble bubble-assistant">
                <Alert tone="error">{message.text}</Alert>
              </div>
            ) : (
              <div key={message.id} className="bubble bubble-assistant">
                <AnswerView answer={message.answer} />
              </div>
            ),
          )
        )}
        {busy && (
          <div className="bubble bubble-assistant bubble-typing" aria-label={t.assistant.thinking}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <form className="assistant-form" onSubmit={handleSubmit}>
        <label htmlFor="assistant-input" className="sr-only">
          {t.assistant.placeholder}
        </label>
        <input
          id="assistant-input"
          value={input}
          maxLength={300}
          placeholder={t.assistant.placeholder}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !input.trim()}
          aria-label={t.assistant.send}
        >
          <Icon name="send" size={18} />
        </button>
      </form>
      <p className="assistant-disclaimer">
        {t.assistant.disclaimer}
        {messages.length > 0 && (
          <>
            {' '}
            <button type="button" className="btn-link" onClick={reset} disabled={busy}>
              {t.assistant.newConversation}
            </button>
          </>
        )}
      </p>
    </section>
  )
}
