# Catálogo de peças, fornecedores e assistente — arquitetura e integrações

## Princípio

**Nenhum produto, preço, stock, referência, compatibilidade ou imagem é inventado.** Tudo o que o cliente vê
vem das tabelas do EuroCargo no Supabase, preenchidas por:

- produtos criados pelo admin;
- importações de ficheiros (CSV / JSON / XML) — ver [catalog-import.md](catalog-import.md);
- sincronização de fornecedores / APIs licenciadas (Edge Function `catalog-sync`);
- consulta em tempo real a um catálogo licenciado (Edge Function `catalog-external`), cujos resultados
  são gravados nas mesmas tabelas antes de serem mostrados.

O preço público é sempre calculado pelo sistema (preço da fonte ou regras de margem sobre o custo); custo,
margem, fornecedor e notas internas nunca chegam ao navegador. Sem scraping de lojas.

Dados de demonstração (`is_demo = true`, marca "DEMO Parts") continuam visíveis com o selo **DEMO** e podem
ser apagados em **Admin → Preços → Apagar dados de demonstração**. As importações nunca os alteram.

## Modelo comercial: a EuroCargo é a vendedora

Os fornecedores são **internos**: fornecem peças à EuroCargo, que vende ao cliente. Por isso:

- **Um produto = um resultado comercial**, mesmo que 5 fornecedores tenham a mesma peça. Cada oferta de
  fornecedor (custo, stock, prazo, referência interna, URL de origem) é uma linha de `supplier_products`.
  A importação junta automaticamente a mesma peça (marca + referência) de vários fornecedores num só produto.
- **O sistema escolhe a melhor oferta** (`catalog_best_offer`), sempre com stock primeiro, pela regra definida
  em Admin → Preços → "Regra de escolha do fornecedor" (`catalog_settings.offer_strategy`):
  menor custo · maior stock · melhor prazo · fornecedor preferencial (`suppliers.preferred` / `priority`).
- **Stock e disponibilidade agregados** (`catalog_refresh_offers`): stock = soma dos fornecedores;
  "Disponível" se algum tem stock, senão "Disponível por encomenda" (com o prazo mais curto), senão
  "Sob consulta", senão "Indisponível". Recalculado automaticamente quando uma oferta ou fornecedor muda.
- **Preço EuroCargo** = custo da oferta escolhida × regra de margem (`catalog_compute_price`). Exemplo:
  A 50 € (com stock), B 55 €, margem 30 % → A escolhido → o cliente vê **65,00 €**; nunca vê 50 €, 30 % nem "A".
- **O cliente nunca vê** fornecedor, contactos, custos, margens, referências internas, notas nem a origem
  comercial: além das tabelas internas (só admin), as colunas internas de `products` (`data_source`,
  `external_id`, `price_mode`, datas de sincronização, `selected_supplier_id`), das imagens, referências,
  compatibilidades e veículos **não são legíveis** pelo browser (privilégios por coluna). O admin lê-as pela
  vista `admin_products` e por `admin_product_offers()` (Admin → Produto → "Fornecedores internos e preço EuroCargo").
- A IA e a pesquisa só devolvem campos públicos: nunca revelam fornecedores.
- Produtos sem ofertas de fornecedor (ex.: peças usadas próprias) mantêm preço e stock manuais.

## Camadas

```
Browser (React)                                Supabase
──────────────────────────────────            ─────────────────────────────────────────────────────────
UI (ShopPage, ProductPage, PartsAssistant,
    VehicleSelector, VehicleLookup, admin)
        │  (só fala com a interface)
        ▼
catalogProvider  (src/services/catalog)
 ├─ LocalCatalogProvider ───────────────────► catalog_search() / tabelas públicas (RLS)
 └─ ExternalCatalogProvider ────────────────► Edge Function catalog-external
                                                 └─ adaptador (_shared/catalog/adapters/*)
                                                       └─ API licenciada (secrets CATALOG_*)
                                                 └─ grava via catalog_import_rows() (service_role)
                                                 └─ responde com catalog_search() (direitos de quem chama)
aiProvider (src/services/ai)
 ├─ LocalCatalogAssistant (regras) ─► catalogProvider
 └─ ExternalAiProvider ────────────────────► Edge Function ai-assistant
                                                 └─ IA só interpreta → ServerCatalog.searchProducts()
Admin → Catálogo → Importação ─────────────► admin_catalog_import_* (is_admin) → importador SQL
Admin → Catálogo → Providers  ─────────────► catalog_sources (RLS admin) · catalog-sync
```

### Interface `CatalogProvider` (`src/services/catalog/types.ts`)

| Método | Para quê |
|---|---|
| `searchProducts(params)` | pesquisa com texto, veículo (marca/modelo/versão/ano/combustível/cilindrada/motor), categoria, estado, marca, disponibilidade, paginação |
| `getProduct(id)` | página do produto (imagens, compatibilidades) |
| `searchByReference(ref)` / `searchByOE(oe)` | referência do fabricante / EAN · número OE (inclui referências cruzadas) |
| `searchByVehicle(vehicle)` | peças compatíveis com um veículo |
| `searchByVIN(vin)` / `searchByPlate(plate, country)` | só com provider que ofereça o serviço; o local devolve `{ supported: false }` |
| `getVehicle(ids)`, `getCompatibility(id)`, `getProductImages(id)`, `getAlternatives(product)` | leituras auxiliares |
| `listCategories/Makes/Models/Variants` | listas de referência (em cache) |
| `capabilities()` | o que o provider sabe responder (`vin`, `plate`, …) — a UI mostra a pesquisa por VIN/matrícula só quando existe |

Implementações:

- **LocalCatalogProvider** — `catalog_search()` (migração 20261002) e, se ainda não aplicada,
  `search_products()` (original). Cache de 60 s para pesquisas e de sessão para listas.
- **ExternalCatalogProvider** — `catalog-external`; leituras por id são locais (os resultados externos são
  gravados localmente, por isso carrinho, pedidos e preços funcionam igual).
- **TecDocCatalogProvider** — no servidor: `supabase/functions/_shared/catalog/adapters/tecdoc.ts`
  (preparado, sem capacidades até existir contrato).

### Escolha do provider (sem rebuild)

`VITE_CATALOG_PROVIDER` (público):

| Valor | Efeito |
|---|---|
| `auto` (padrão) | local; usa também o externo enquanto houver uma fonte **ativa** com utilização "Consulta em tempo real"/"Ambos" em Admin → Catálogo → Providers (lida por `catalog_public_config()`, cache 5 min) |
| `local` | nunca chama o externo |
| `external` | tenta sempre o externo primeiro |

Em todos os casos, se `catalog-external` não estiver publicada/configurada (HTTP 404/503), responde o catálogo local.

## Pesquisa

A loja interpreta a pesquisa escrita ("pastilhas Peugeot 307 1.6 HDI 2005") e aplica os filtros
correspondentes (veículo, ano, motor, combustível, referência, OE), mostrando "Pesquisa interpretada" com a
opção "Pesquisar só o texto". Ordenação (20261005): referência exata › OE / referência cruzada › todos os
termos › termos no **nome** da peça › veículo mais específico (motor › modelo › marca) › preço. Cada resultado
diz como correspondeu e a loja separa **correspondências exatas** de **resultados aproximados**. Sem
resultados (ou só aproximados), o cliente pode **pedir a peça à EuroCargo** (pedido pré-preenchido com a
pesquisa) ou perguntar ao assistente: a equipa procura a peça junto dos fornecedores e responde com preço e
prazo — a venda é sempre da EuroCargo. A loja não faz scraping de outras lojas.

`catalog_search(p_params jsonb)`:

1. termos normalizados (sem acentos, minúsculas), com **stems** PT/ES (`pastilhas`→`pastilh`,
   `dianteira/dianteiro`→`dianteir`) e **sinónimos** da tabela `search_synonyms`
   (`farol` ↔ `ótica`/`faro`/`headlight`…, editável por admins);
2. 1.ª passagem: produtos com **todos** os termos (índice trigram, um só varrimento);
3. se não houver nenhum: produtos com **alguns** termos, ordenados por quantos (limitado a 2000 candidatos por termo);
4. referências / OE / EAN / referências cruzadas pelo índice de `product_references`;
5. filtros de veículo: uma compatibilidade sem versão (motor) serve todas as versões do modelo; com versão,
   é filtrada por combustível, cilindrada (±60 cc), nome/código do motor e anos;
6. total limitado a 1000 (`total_capped`) para não contar milhões de linhas; paginação por `limit/offset`.

O assistente transforma a pergunta em filtros (`src/services/ai/queryParser.ts`):

| Pergunta | Filtros |
|---|---|
| "pastilhas Peugeot 307 1.6 HDI 2005" | texto `pastilhas` · Peugeot · 307 · 2005 · 1600 cc · motor `hdi` · gasóleo |
| "farol esquerdo Opel Vectra 2008" | texto `farol esquerdo` · Opel · Vectra · 2008 |
| "amortecedor dianteiro Hyundai Accent 1994" | texto `amortecedor dianteiro` · Hyundai · Accent · 1994 |
| "referência 123456" | referência `123456` |
| "OE 123456789" | OE `123456789` |

Se não houver correspondência confirmada: "Não encontrámos uma correspondência confirmada no nosso catálogo.
Contacte um especialista." (com os botões de contacto/WhatsApp).

### Perguntas sobre a loja (preços, stock, DEMO, encomendas)

`src/services/ai/shopQuestions.ts` reconhece, nos seis idiomas, perguntas sobre a própria loja — "os preços
são reais?", "têm stock?", "como faço uma encomenda?" — e o assistente responde-lhes **antes** de qualquer
pesquisa, com textos fixos (`assistant.info` nos dicionários) e nunca com preços, stock ou prazos inventados:

- **estado do catálogo**: contagem real de produtos ativos DEMO / não DEMO visíveis ao cliente (consulta só de
  leitura a `products`). Mostrado quando a pergunta é "é real?"/DEMO e sempre que não há produtos reais à venda
  ("Neste momento, todos os N produtos do catálogo são de demonstração…"). Desconhecido (texto genérico) quando
  a pesquisa usa um catálogo externo;
- **preços**: DEMO = ilustrativo; restantes = indicativo, confirmado pela EuroCargo antes de qualquer pagamento;
- **disponibilidade/stock**: a registada no catálogo; DEMO não é stock real; confirmada antes do pagamento;
- **encomendas**: pedido → confirmação de preço, disponibilidade, portes e prazo pela EuroCargo → pagamento.

Uma palavra de tema sozinha não chega ("preço pastilhas Golf" continua a ser uma pesquisa): é preciso "?",
uma palavra interrogativa, "real/verdadeiro" ou nada mais para pesquisar. Se a pergunta também nomeia uma peça
("Qual é o preço das pastilhas Golf V?"), a resposta fixa vem primeiro e a pesquisa corre com as palavras que
sobram; só se mostram correspondências exatas (ou aproximadas quando há veículo/referência), para que palavras
da pergunta não tragam resultados soltos. Referências (`DEMO-307-HL-L-N`, `0986494`) nunca são tratadas como
palavras da pergunta. Estas perguntas são sempre respondidas localmente, mesmo com `VITE_AI_PROVIDER=external`.

## Veículos

Marca → Modelo (+ geração) → Versão/motor (nome, código do motor, combustível, cilindrada, kW, cv, anos) →
compatibilidade por produto (anos, posição, notas, verificada). O seletor da loja mostra "Motorização" quando
o modelo tem versões. VIN e matrícula: preparado em `searchByVIN` / `searchByPlate`, ativo só com um provider
que ofereça esse serviço (a pesquisa não guarda VIN nem matrículas).

## Fornecedores e preços

Cada produto pode ter vários fornecedores (`supplier_products`): referência do fornecedor, custo, moeda,
stock, estado, disponibilidade, prazo, URL interna/origem, última atualização — tudo só para admins.
O preço público: preço da fonte, ou regras de margem (produto › fornecedor › categoria › estado › faixa de
custo › geral) sobre o custo do fornecedor mais barato com stock (`catalog_compute_price`, mesmo cálculo de
`admin_recalculate_price`). Histórico em `product_price_history`.

## Assistente com IA (Claude)

- Sem IA configurada, o assistente usa a interpretação local (regras) + a pesquisa do catálogo.
- Com IA: `supabase secrets set AI_PROVIDER=anthropic AI_API_KEY=<chave Anthropic> [AI_MODEL=claude-opus-5-5]`,
  `supabase functions deploy ai-assistant` e `VITE_AI_PROVIDER=external` (novo build). A IA (Claude, via SDK
  oficial no servidor, saída estruturada JSON, esforço `low`, *fallback* automático em caso de recusa) só
  transforma o pedido em campos de pesquisa; produtos, preços e compatibilidades vêm sempre da base de dados.
- Se a IA falhar, o site responde com a pesquisa do catálogo e avisa o cliente ("assistente avançado
  indisponível").
- O assistente faz perguntas quando falta informação (veículo ou peça), permite adicionar resultados ao pedido
  e mantém o histórico durante a visita.

## Onde ficam as credenciais (nunca no frontend)

Só em secrets do Supabase (ou `supabase/functions/.env` em desenvolvimento local, valores vazios por omissão —
ver `supabase/functions/.env.example`):

```bash
# Catálogo licenciado / fornecedor
supabase secrets set CATALOG_PROVIDER=<adaptador> CATALOG_API_URL=<url> CATALOG_API_KEY=<chave>
supabase functions deploy catalog-external
supabase functions deploy catalog-sync

# Fornecedor de IA (quando for escolhido e contratado)
supabase secrets set AI_PROVIDER=<nome> AI_API_KEY=<chave> AI_MODEL=<modelo opcional>
supabase functions deploy ai-assistant
```

`catalog_sources.config` guarda apenas definições não secretas (a base de dados recusa campos como
`api_key`, `token`, `secret`, `password`).

## Ativar o TecDoc (quando houver contrato TecAlliance)

1. Implementar `supabase/functions/_shared/catalog/adapters/tecdoc.ts` (o ficheiro descreve o mapeamento
   artigo → linha canónica) e devolver as capacidades reais.
2. `supabase secrets set CATALOG_PROVIDER=tecdoc CATALOG_API_URL=… CATALOG_API_KEY=…` e publicar
   `catalog-external` (e `catalog-sync`, se também for importar).
3. Admin → Catálogo → Providers → fonte **TecDoc** (já criada, inativa): pôr em `config` o provider id /
   idioma / país do contrato, escolher a utilização e **ativar**.
4. `npm run check:supabase` e testar uma pesquisa na loja.

## Adicionar outro fornecedor / catálogo

- **Ficheiros**: criar uma fonte "Ficheiros" em Providers e importar (sem código).
- **API com o contrato EuroCargo** ([catalog-import.md](catalog-import.md#api--feed-rest-sincronização-incremental)):
  adaptador `eurocargo-feed`, sem código.
- **Outra API**: criar `supabase/functions/_shared/catalog/adapters/<nome>.ts` que implemente `CatalogAdapter`
  (`search`, `fetchChanges`, `decodeVin`… o que a API oferecer) mapeando para `ImportRow`, registá-lo em
  `registry.ts`, definir `CATALOG_PROVIDER=<nome>` e criar a fonte em Providers.

Nota: os secrets `CATALOG_*` configuram um adaptador de cada vez. Para vários fornecedores por API em
simultâneo, generalizar `registry.ts` para ler secrets por fonte (ex.: `CATALOG_<CHAVE>_API_KEY`).

## Desempenho (centenas de milhares / milhões de registos)

- Paginação no servidor (máx. 60 por página); nunca se carregam milhares de produtos no navegador.
- Índices: trigram em `search_text`, `product_references(reference_norm)`, `(data_source, external_id)`,
  `(brand_id, referência normalizada)`, compatibilidades por veículo, nomes de modelos/versões.
- Contagem limitada a 1000; listas admin com contagem estimada; árvore de veículos no admin filtrada por
  marca/modelo.
- Importação em blocos, uma transação por bloco, refresco do texto de pesquisa uma vez por produto.
- Sincronização incremental por cursor; cache das consultas externas (`catalog_live_queries`, `cache_ttl_minutes`).
- Medição local (Postgres em WASM, 100 000 produtos sintéticos): referência ~60 ms; texto 200–400 ms;
  texto + veículo sem correspondência total ~1,1 s (passagem "alguns termos"). Num Postgres real é mais rápido;
  acima de alguns milhões de produtos, considerar um motor de pesquisa dedicado (Postgres FTS com
  `tsvector`, Typesense, Meilisearch) como mais um `CatalogProvider`.

## Licenças e dados

- Não fazer scraping de lojas nem copiar imagens, preços ou dados sem autorização.
- Imagens: apenas próprias ou licenciadas; licença obrigatória na importação (`product_images.license`),
  origem em `product_images.source`, URL original em `product_image_sources` (admin).
