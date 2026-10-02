import { normalize } from './queryParser'

/**
 * Questions about the shop itself (not a part search): "os preços são reais?",
 * "têm stock?", "como encomendo?". The assistant answers them with fixed, true
 * texts (i18n `assistant.info`) plus the catalogue's real DEMO / real product counts,
 * never with invented prices, stock or delivery times.
 */
export type ShopTopic = 'demo' | 'prices' | 'availability' | 'orders'

export interface ShopQuestion {
  /** In answer order; 'demo' first when the customer asks whether something is real. */
  topics: ShopTopic[]
  /** The words left once the question vocabulary is removed (may still name a part / vehicle). */
  searchText: string
}

/** Product counts visible to the customer, or null when unknown (external catalogue, error). */
export interface CatalogStatus {
  real: number
  demo: number
}

interface TopicWords {
  exact: string[]
  prefixes: string[]
}

// Six languages (pt, es, en, fr, de, it), accent-free and lower-case.
// Prefixes are chosen so that they do not start common part names (e.g. no "cart", which starts "carter").
const TOPICS: Record<ShopTopic, TopicWords> = {
  demo: {
    exact: ['demo', 'demos', 'fake'],
    prefixes: ['demonstra', 'demostra', 'dimostra', 'ilustrativ', 'illustrativ', 'illustratif', 'fictic', 'fictif', 'fiktiv'],
  },
  prices: {
    exact: ['custa', 'custam', 'cuesta', 'cuestan', 'cost', 'costs', 'kostet', 'kosten', 'costa', 'costano'],
    prefixes: ['preco', 'precio', 'price', 'pricing', 'prix', 'preis', 'prezz', 'orcament', 'presupuest', 'devis', 'tarif'],
  },
  availability: {
    exact: ['available', 'availability', 'vorrat', 'vorratig', 'lagerbestand'],
    prefixes: ['stock', 'existenc', 'disponi', 'verfugbar', 'esgotad', 'agotad', 'rupture'],
  },
  orders: {
    exact: ['pago', 'pay', 'cart', 'carts', 'buy', 'ship', 'portes', 'plazo', 'prazo', 'prazos', 'plazos'],
    prefixes: [
      'encomend', 'pedido', 'order', 'commande', 'bestell', 'ordin', 'ordine',
      'compra', 'comprar', 'purchas', 'achet', 'achat', 'kauf', 'acquist',
      'pagament', 'pagar', 'paym', 'paying', 'paiement', 'payer', 'zahlung', 'bezahl', 'pagare',
      'entreg', 'envio', 'enviam', 'enviar', 'shipping', 'livr', 'liefer', 'consegn', 'spedi', 'delai',
      'checkout', 'carrinho', 'carrito', 'panier', 'warenkorb', 'carrello',
    ],
  },
}

/** "Is it real?" in the six languages: always also answered with the DEMO status. */
const REAL_WORDS = new Set([
  'real', 'reais', 'reales', 'reale', 'reali', 'reel', 'reels', 'reelle', 'reelles', 'echt', 'echte', 'vero', 'veri', 'vera', 'vere',
  'true', 'genuine', 'verdadeiro', 'verdadeiros', 'verdadeira', 'verdadeiras', 'verdadero', 'verdaderos',
  'verdadera', 'verdaderas', 'vrai', 'vrais', 'vraie', 'vraies', 'autentico', 'autenticos', 'confirmado',
  'confirmados', 'confirmada', 'confirmadas', 'confirmed',
])

/** Words that make the text a question (besides "?"). */
const QUESTION_WORDS = new Set([
  // pt
  'como', 'quando', 'quanto', 'quanta', 'quantos', 'quantas', 'qual', 'quais', 'onde', 'porque', 'sao', 'e',
  'posso', 'podem', 'pode', 'funciona', 'existe', 'existem', 'ha',
  // es
  'cuando', 'cuanto', 'cuanta', 'cuantos', 'cual', 'cuales', 'donde', 'son', 'es', 'puedo', 'pueden', 'hay',
  // en
  'how', 'when', 'what', 'which', 'where', 'why', 'are', 'is', 'does', 'can',
  // fr
  'comment', 'quand', 'combien', 'quel', 'quelle', 'quels', 'quelles', 'ou', 'est', 'sont', 'pourquoi', 'puis',
  // de
  'wie', 'wann', 'was', 'welche', 'welcher', 'wo', 'warum', 'sind', 'ist', 'kann', 'gibt',
  // it
  'come', 'quale', 'quali', 'dove', 'perche', 'sono', 'funziona',
])

/** Words that carry nothing to search once the question vocabulary is gone. */
const GENERIC_WORDS = new Set([
  // pt
  'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'que', 'se',
  'isto', 'isso', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aqui', 'site', 'loja',
  'catalogo', 'produto', 'produtos', 'artigo', 'artigos', 'voces', 'vos', 'eu', 'me', 'meu', 'minha', 'tudo',
  'todos', 'todas', 'nao', 'sim', 'ja', 'ainda', 'agora', 'neste', 'momento', 'mesmo', 'mesmos', 'ter', 'tem',
  'tens', 'tenho', 'faco', 'fazer', 'saber', 'ola', 'para', 'por', 'com', 'peca', 'pecas', 'mostrados', 'mostram', 'apresentados',
  // es
  'el', 'la', 'los', 'las', 'lo', 'un', 'unos', 'unas', 'en', 'estos', 'tienda', 'producto', 'productos', 'y',
  'tienen', 'tiene', 'pieza', 'piezas', 'hola', 'mi',
  // en
  'the', 'of', 'in', 'on', 'this', 'these', 'those', 'you', 'your', 'here', 'shop', 'store', 'product',
  'products', 'item', 'items', 'catalog', 'catalogue', 'it', 'they', 'them', 'and', 'not', 'do', 'i', 'my',
  'have', 'has', 'part', 'parts', 'now', 'to', 'an',
  // fr
  'le', 'les', 'des', 'du', 'ce', 'ces', 'cette', 'votre', 'boutique', 'produit', 'produits', 'ici', 'et',
  'pas', 'vous', 'avez', 'je', 'piece', 'pieces',
  // de
  'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'im', 'diese', 'dieser', 'produkt', 'produkte', 'hier',
  'ihre', 'und', 'nicht', 'sie', 'haben', 'ich', 'teil', 'teile',
  // it
  'il', 'gli', 'questo', 'questi', 'negozio', 'prodotto', 'prodotti', 'qui', 'vostri', 'vostro', 'ed', 'non',
  'avete', 'ricambi', 'ricambio',
])

const PUNCTUATION = /^[¿¡"'«»“”‘’(),.;:!?]+|[¿¡"'«»“”‘’(),.;:!?]+$/g

function topicOf(word: string): ShopTopic | null {
  for (const [topic, { exact, prefixes }] of Object.entries(TOPICS) as [ShopTopic, TopicWords][]) {
    if (exact.includes(word) || prefixes.some((prefix) => word.startsWith(prefix))) return topic
  }
  return null
}

/**
 * Null when the text is an ordinary part search. A shop topic word alone is not enough
 * ("preço pastilhas Golf" is a search): the text must also be a question ("?", a question
 * word, "is it real"), ask about DEMO data, or contain nothing else to search.
 */
export function detectShopQuestion(query: string): ShopQuestion | null {
  const topics = new Set<ShopTopic>()
  let askedReal = false
  let questionCue = query.includes('?')
  const kept: string[] = []

  for (const raw of query.split(/\s+/)) {
    const token = raw.replace(PUNCTUATION, '')
    if (!token) continue
    const word = normalize(token)
    // Only plain words: references such as "DEMO-307-HL-L-N" or "0986494" stay search terms.
    if (!/^[a-z]+$/.test(word)) {
      kept.push(token)
      continue
    }
    const topic = topicOf(word)
    if (topic) topics.add(topic)
    else if (REAL_WORDS.has(word)) askedReal = true
    else if (QUESTION_WORDS.has(word)) questionCue = true
    else if (!GENERIC_WORDS.has(word)) kept.push(token)
  }

  if (askedReal) topics.add('demo')
  if (topics.size === 0) return null

  const searchText = kept.join(' ')
  if (!questionCue && !askedReal && !topics.has('demo') && searchText) return null

  const order: ShopTopic[] = ['demo', 'prices', 'availability', 'orders']
  return { topics: order.filter((topic) => topics.has(topic)), searchText }
}
