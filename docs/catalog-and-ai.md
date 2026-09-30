# Catálogo de peças, fornecedores e assistente — arquitetura e integrações futuras

## Princípio

**Nenhum produto, preço, stock, referência ou compatibilidade é inventado.** Tudo o que o cliente vê vem:

- das tabelas do EuroCargo no Supabase (produtos criados pelo admin, importações de fornecedores), ou
- de um catálogo externo **licenciado**, através de uma Edge Function.

Dados de demonstração (`is_demo = true`, marca "DEMO Parts") são mostrados com o selo **DEMO** e podem ser apagados em **Admin → Preços → Apagar dados de demonstração** (função `admin_purge_demo_data()`).

## Camadas

```
Browser (React)                       Supabase
─────────────────────────────         ──────────────────────────────────────────
catalogProvider                       tabelas: products, product_images,
 ├─ LocalCatalogProvider  ─────────►   product_vehicle_compatibility, brands,
 │   (search_products RPC, RLS)        vehicle_makes/models/variants, part_categories
 └─ ExternalCatalogProvider ───────►  Edge Function catalog-external ──► API licenciada
                                        (CATALOG_API_KEY em secrets)
aiProvider
 ├─ LocalCatalogAssistant (regras,     search_products + log_assistant_exchange
 │   sem IA externa)
 └─ ExternalAiProvider ────────────►  Edge Function ai-assistant ──► fornecedor de IA
                                        (AI_API_KEY em secrets; a IA só interpreta
                                         o pedido, os dados vêm de search_products)
```

Seleção no frontend (`.env`, valores públicos):

| Variável | Valores | Efeito |
|---|---|---|
| `VITE_CATALOG_PROVIDER` | `local` (padrão) / `external` | `external` tenta a Edge Function e volta ao local enquanto não estiver configurada |
| `VITE_AI_PROVIDER` | `local` (padrão) / `external` | idem para o assistente |
| `VITE_WHATSAPP_PT` / `VITE_WHATSAPP_ES` | só dígitos, ex.: `351…` / `34…` | ativa os botões WhatsApp (Portugal / Espanha) |

## Onde ficam as credenciais (nunca no frontend)

```bash
# Fornecedor de IA (quando for escolhido e contratado)
supabase secrets set AI_PROVIDER=<nome> AI_API_KEY=<chave> AI_MODEL=<modelo opcional>
supabase functions deploy ai-assistant

# Catálogo licenciado (TecDoc/TecAlliance ou semelhante)
supabase secrets set CATALOG_PROVIDER=<nome> CATALOG_API_URL=<url> CATALOG_API_KEY=<chave>
supabase functions deploy catalog-external
```

Depois de fazer o deploy, definir `VITE_AI_PROVIDER=external` e/ou `VITE_CATALOG_PROVIDER=external` e fazer um novo build.

## O que falta implementar em cada integração

1. **IA** — `supabase/functions/_shared/ai-provider.ts`: implementar `AiBackend.interpret()` para o fornecedor escolhido. Deve devolver apenas `{ text, make, model, year, condition, reference }`. A Edge Function aceita apenas veículos que existem na base de dados e responde com linhas de `search_products`.
2. **Catálogo externo** — `supabase/functions/catalog-external/index.ts`: implementar `ExternalCatalog` (search / product / alternatives) com mapeamento para `CatalogSearchResult` e `ProductDetail` (`src/types/catalog.ts`) e `data_source` = nome do fornecedor.
3. **Feeds de fornecedores** (stock, custo, prazo): importar para `supplier_products` a partir de uma Edge Function ou tarefa agendada com `service_role`. O preço público calcula-se com `admin_recalculate_price()` / `admin_recalculate_all_prices()`.
4. **Pesquisa por matrícula / VIN**: exige um catálogo externo que o suporte. O assistente deteta VIN/matrícula e explica que ainda não está disponível.

## Licenças e dados

- Não fazer scraping de lojas nem copiar imagens, preços ou dados sem autorização.
- Imagens: apenas próprias ou licenciadas. O campo `product_images.source` guarda o crédito ou a licença.
- Custos de fornecedor (`supplier_products.cost_price`), margens (`price_rules`) e histórico de preços são visíveis apenas para administradores (RLS).
