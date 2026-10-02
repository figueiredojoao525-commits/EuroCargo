# EuroCargo

Plataforma híbrida: **peças automóveis** (loja + assistente de pesquisa), **transporte** e **rastreamento** de encomendas entre Portugal, Espanha e a Europa. O administrador é o centro operacional: clientes, produtos, fornecedores, preços, pedidos, pagamentos, transporte e tracking.

**Stack:** React 19, TypeScript, Vite, React Router, Supabase (Auth, PostgreSQL, RLS, Edge Functions) e CSS simples. O pagamento está preparado para Stripe Checkout.

## Comandos

```bash
npm install
cp .env.example .env      # preencher VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev               # http://localhost:5173
npm run build             # typecheck + build de produção (dist/)
npm run lint              # oxlint
npm run typecheck         # só TypeScript
npm test                  # testes unitários (importador CSV/JSON/XML, interpretação de pesquisas)
npm run check:supabase    # teste de ligação ao Supabase do .env (só leitura)
npm run check:catalog     # teste funcional do catálogo no Supabase do .env (visitante, só leitura)
npm run test:e2e          # testes no browser (Chrome) contra `vite preview --port 4180`: loja, pesquisa, produto, carrinho, assistente, rastreio, login, admin protegido, idiomas, telemóvel
npm run import:catalog -- ficheiro.csv --dry-run   # validar / importar catálogos grandes (docs/catalog-import.md)
```

Sem `.env`, o site abre na mesma, mas mostra um aviso e as funcionalidades de conta e rastreamento ficam indisponíveis.

## Estrutura

```
src/
  components/   UI reutilizável (Header, Footer, TrackingForm, EventTimeline, ...)
  layouts/      MainLayout, AdminLayout
  pages/        páginas públicas, de cliente, shop/ (loja) e admin/
  services/     acesso a dados (Supabase): auth, shipments, tracking, payments, admin,
                orders, cart, whatsapp, adminCatalog, adminOrders,
                catalog/ (CatalogProvider: Local / External + escolha em tempo de execução),
                catalogImport/ (parsers CSV/JSON/XML, mapeamento e validação, envio em blocos),
                ai/ (AiProvider: LocalCatalogAssistant / External; queryParser)
  hooks/        useAuth, useAsync
  i18n/         pt/es/en/fr/de/it + parts/ (textos da loja e do admin) e o provider
  lib/          cliente Supabase
  types/        tipos de domínio (espelham o schema SQL)
  utils/        formatação, validação, países
supabase/
  migrations/   schema inicial + migrações incrementais (estados de tracking, catálogo/pedidos, seed demo,
                catálogo em escala: providers, importação, referências, veículos, imagens, pesquisa)
  functions/    Edge Functions: create-checkout, payment-webhook, ai-assistant, catalog-external, catalog-sync
                _shared/catalog/: CatalogProvider do servidor, adaptadores (eurocargo-feed, tecdoc)
docs/
  catalog-and-ai.md   arquitetura CatalogProvider, pesquisa, credenciais, ativar TecDoc, novos fornecedores
  catalog-import.md   importação CSV/JSON/XML/API: campos, regras, formatos, contrato de feed
  examples/           ficheiros de exemplo (só formato, sem produtos reais)
```

## Idiomas

Português (padrão), Español, English, Français, Deutsch e Italiano. Os textos estão em `src/i18n/<código>.ts`; `pt.ts` define a estrutura e o TypeScript obriga os outros dicionários a terem as mesmas chaves.

Idioma inicial, por ordem de prioridade:

1. `?lang=xx` no URL (não fica guardado; serve para links por idioma e futuras URLs `hreflang`);
2. escolha manual anterior, guardada em `localStorage` (`eurocargo_language`);
3. idioma do navegador (`navigator.languages`, depois `navigator.language`), pelo prefixo: `pt-BR` → PT, `en-US` → EN;
4. Português.

A troca de idioma atualiza de imediato a interface, `<html lang>`, o título, a `description` e as tags `og:*`.

Para adicionar um idioma: criar `src/i18n/<código>.ts` tipado como `Dictionary`, registá-lo em `LANGUAGES`, `dictionaries` e `LANGUAGE_META` (`src/i18n/index.ts`) e adicionar a bandeira em `src/components/Flag.tsx`.

## Configurar o Supabase

1. Criar um projeto em https://supabase.com (região na UE, por exemplo Frankfurt, por causa do RGPD).
2. Aplicar as migrações de `supabase/migrations/` **por ordem e uma única vez**:
   `20260930000000_initial_schema` → `20261001000000_tracking_statuses` → `20261001000100_parts_catalog_orders` → `20261001000200_demo_catalog_seed` (opcional: dados de demonstração) → `20261002000000_catalog_scale_import` (catálogo em escala; aditiva — não apaga dados nem os produtos DEMO) → `20261003000000_catalog_import_match_fix` (atualizações de preço/stock sem coluna de estado) → `20261004000000_eurocargo_seller_model` (EuroCargo vendedora: vários fornecedores internos por produto, escolha da melhor oferta, stock agregado, colunas internas invisíveis para clientes) → `20261004000100_demo_catalog_expansion` (opcional: catálogo DEMO alargado, ~750 produtos, 15 categorias, 3 fornecedores DEMO) → `20261005000000_search_relevance_catalog_ops` (relevância da pesquisa: referência › OE › nome › veículo, exato vs aproximado; desativar produtos em falta num feed completo; ocultar/mostrar DEMO) → `20261006000000_vehicle_reference_eea` (veículos reais: 39 marcas, 447 modelos e 3 181 motorizações a partir dos dados abertos da Agência Europeia do Ambiente, CC BY 4.0; só dados de referência — sem produtos, preços nem stock).
   Ficheiros prontos a colar no SQL Editor (numa transação): `apply_20261003_20261004_transaction.sql` (aplicado), `apply_20261005_transaction.sql` (aplicado) e `apply_20261006_transaction.sql`.
   Enquanto a última não estiver aplicada, a loja continua a funcionar com a pesquisa original (`search_products`) e as páginas de importação/providers mostram um aviso.
   Cada ficheiro deve correr na sua própria execução (um valor novo de enum só pode ser usado depois de confirmado).
   - pelo **SQL Editor** (um ficheiro de cada vez), ou
   - com a CLI: `supabase link --project-ref <ref>` e depois `supabase db push` (só aplica migrações em falta).
   - Não usar `supabase db reset --linked`: apaga a base de dados remota.
3. Em **Authentication → URL Configuration**:
   - Site URL: o domínio do site (em desenvolvimento, `http://localhost:5173`);
   - Redirect URLs: `<site>/login` e `<site>/reset-password` (para cada domínio usado, incluindo `http://localhost:5173`).
4. A confirmação de email é opcional (**Authentication → Providers → Email**). O registo trata os dois casos.
5. Copiar o **Project URL** para `VITE_SUPABASE_URL` e a chave **publishable** para `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` (a chave **anon** legada continua aceite em `VITE_SUPABASE_ANON_KEY`). Nunca colocar a chave `secret`/`service_role` no frontend; a app recusa-a.
6. Executar `npm run check:supabase`. O teste só faz leituras e confirma: Auth acessível, migração aplicada, e que um visitante anónimo não lê nenhuma tabela nem executa funções de pagamento ou de administração.

Notas:
- Se em **Settings → Data API** a exposição automática de novas tabelas estiver desativada, o frontend funciona na mesma (a migração concede explicitamente o que precisa), mas a Edge Function `create-checkout` precisa de `grant select, update on public.payments to service_role`.
- O Supabase concede `EXECUTE` a `anon`/`authenticated` em funções novas. Cada migração futura que crie funções deve revogar esse acesso, como faz a migração inicial.

### Criar um administrador

Não é possível tornar uma conta administradora a partir do site. Depois de a conta estar registada, executar no SQL Editor:

```sql
update public.profiles set role = 'admin'
where user_id = (select id from auth.users where email = 'admin@exemplo.com');
```

## Modelo de segurança

- RLS ativo em todas as tabelas. Cada cliente só vê as suas encomendas, eventos e pagamentos.
- Permissões por coluna: um cliente só pode inserir os dados da encomenda e só pode editar `full_name`, `phone` e `country` do seu perfil. Não tem acesso a `role`, `status`, `tracking_code` nem `tracking_fee`.
- As alterações sensíveis passam por funções `SECURITY DEFINER` que validam tudo no servidor:
  - `request_tracking_code`: o cliente pede o código e é criado um pagamento *pending* com o valor definido na BD (1,00 EUR).
  - `confirm_tracking_payment`: **só o `service_role`** (o webhook) a pode executar. Valida o valor e a moeda, marca o pagamento como *paid* e gera o código de rastreio. É idempotente.
  - `admin_add_shipment_event`: só administradores. Altera o estado, cria o evento no histórico e regista a ação em `admin_actions`.
  - `get_tracking`: consulta pública pelo código. Não devolve nomes, telefones nem moradas.
- Código de rastreio: `EC-<PAÍS>-<ANO>-<6 caracteres>`, gerado com `gen_random_bytes` (32 símbolos, ~1,07 mil milhões de combinações por país e ano).

- Loja e pedidos (migração `20261001000100`):
  - público (anónimo): só produtos, imagens, compatibilidades, marcas, categorias e veículos **ativos**, e a função `search_products` (corre com os direitos de quem chama, logo com RLS);
  - custos (`supplier_products`), fornecedores, regras de margem e histórico de preços: **só administradores**;
  - clientes veem apenas o seu registo de cliente, moradas e pedidos; criam pedidos só através de `create_part_request`, que usa os preços da base de dados;
  - notas internas dos pedidos (`order_notes`) nunca são visíveis ao cliente;
  - `admin_create_shipment` / `admin_generate_tracking_code`: só administradores; permitem emitir o código de rastreio sem o pagamento online (encomendas por telefone/WhatsApp), ficando `tracking_fee_waived = true`.
- Modelo vendedor (migração `20261004000000`): a EuroCargo é a vendedora; fornecedores, custos, margens, referências internas e origem dos dados nunca são legíveis pelo cliente (tabelas só admin + privilégios por coluna em `products`, imagens, referências, compatibilidades e veículos). O admin vê tudo em `admin_products` e `admin_product_offers()`. Ver [docs/catalog-and-ai.md](docs/catalog-and-ai.md#modelo-comercial-a-eurocargo-é-a-vendedora).
- Catálogo em escala (migração `20261002000000`):
  - público: `catalog_search()` (direitos de quem chama, RLS), `catalog_public_config()` (só chave/tipo/capacidades das fontes ativas), referências públicas (`product_references`: referência, OE, EAN, cruzadas — nunca referências de fornecedor) e sinónimos;
  - só administradores: `catalog_sources`, `catalog_import_batches`, `product_image_sources` (URL original das imagens), `catalog_live_queries`; importação por `admin_catalog_import_*` (verificam `is_admin()`);
  - só `service_role` (Edge Functions): `catalog_import_*` e `catalog_compute_price`;
  - nenhuma credencial na base de dados: `catalog_sources.config` recusa campos `api_key`/`token`/`secret`/`password`.
- Tracking público (`get_tracking`): estado, histórico (data, localização, descrição), cidade/país de origem e destino e o destinatário abreviado ("João F."). Nunca telefones, emails, moradas, preços, fornecedores ou dados internos.

## Loja de peças, assistente e administração

- Rotas públicas: `/pecas`, `/pecas/:id`, `/veiculos`, `/categorias`, `/carrinho`, `/rastrear` (alias de `/track`). Cliente: `/dashboard`, `/pedidos/:id`.
- Admin: `/admin` (visão geral), `/admin/orders` (incluindo criar encomenda manual), `/admin/customers`, `/admin/shipments/new`, `/admin/products`, `/admin/catalog`, `/admin/catalog/import` (importação CSV/JSON/XML), `/admin/catalog/providers` (fontes de catálogo: ativar/desativar, sincronizar), `/admin/brands`, `/admin/suppliers`, `/admin/pricing`, `/admin/payments`, `/admin/ai`.
- **Catálogo em escala** (migração `20261002000000`): `CatalogProvider` com fontes locais/externas trocáveis sem rebuild, importação em massa com validação e sem duplicados, vários fornecedores por produto, referências OE/EAN/cruzadas indexadas, veículos com geração e motorização, imagens com licença e imagem principal, pesquisa com sinónimos/stems e filtros de motor. Ver [docs/catalog-and-ai.md](docs/catalog-and-ai.md) e [docs/catalog-import.md](docs/catalog-import.md).
- **Dados de demonstração**: a migração `20261001000200` cria 8 produtos fictícios (marca "DEMO Parts", selo DEMO na loja) e a `20261004000100` alarga para ~750 produtos DEMO (15 categorias, veículos populares na Europa, 3 fornecedores internos DEMO com custos/stock/prazos, marcas "DEMO …", sem códigos OE/EAN inventados). Produtos sem foto mostram uma imagem ilustrativa da categoria. Categorias e veículos criados são dados de referência reais. Para apagar tudo o que é demo: **Admin → Preços → Apagar dados de demonstração**.
- **Preços**: preço público = custo do fornecedor × (1 + margem %) + valor fixo, pela regra mais específica (produto › fornecedor › categoria › estado › faixa de custo › geral). O cliente nunca vê custo nem margem.
- **Assistente**: por omissão é local (sem IA externa). Interpreta o pedido (peça, marca, modelo, ano, estado, referência) e mostra apenas o que existe no catálogo. Responde diretamente a perguntas sobre preços, stock/disponibilidade, produtos DEMO e encomendas (com a contagem real de produtos DEMO/reais), sem inventar valores. Quando não encontra: "Não encontrei uma correspondência confirmada no catálogo…" e oferece falar com um especialista.
- **WhatsApp**: `VITE_WHATSAPP_PT` (Portugal) e `VITE_WHATSAPP_ES` (Espanha), números públicos só com dígitos. O site escolhe o número pelo país da conta do cliente (PT/ES) ou, sem conta, pelo idioma (pt → Portugal, es → Espanha); noutros idiomas mostra os dois. A secção Contactos lista sempre ambos. Mensagens pré-preenchidas via `wa.me`.
- **Imagens**: bucket público `product-images` (só administradores carregam; máx. 2 MB). Usar apenas imagens próprias ou licenciadas. Produtos sem foto própria mostram **fotografias ilustrativas** do tipo de peça (195 fotos de licença livre do Wikimedia Commons, 67 tipos de peça, várias por tipo, pesquisadas nas categorias do Commons e em 5 línguas; página Categorias com «Componentes por categoria»; com crédito e a etiqueta «Imagem ilustrativa»; conectores opcionais Pexels/Pixabay com chave gratuita). **VIN:** descodificado com a API pública da NHTSA (em veículos europeus normalmente só a marca). Importação de fotos em massa por referência (`npm run images:import`), relatório de cobertura (`npm run images:report`), custos e manutenção: [docs/images.md](docs/images.md).
- Integrações futuras (catálogo licenciado TecDoc/TecAlliance, fornecedor de IA, feeds de fornecedores): ver [docs/catalog-and-ai.md](docs/catalog-and-ai.md).

## Pagamento de €1,00 (estado atual: não configurado)

O fluxo está implementado, mas **não processa pagamentos enquanto um provider não for configurado**. Até lá, o botão de pagamento mostra "pagamento online ainda não disponível" e o pedido fica registado como *pending*.

```
Cliente → request_tracking_code (BD cria pagamento pending de 1,00 EUR)
        → Edge Function create-checkout → Stripe Checkout
        → Stripe envia webhook assinado → Edge Function payment-webhook
        → confirm_tracking_payment (valida valor/moeda) → código de rastreio gerado
```

A página `/payment/return` **não** confirma pagamentos: limita-se a aguardar que o código apareça na base de dados.

Para ativar o Stripe:

```bash
supabase functions deploy create-checkout
supabase functions deploy payment-webhook --no-verify-jwt   # o Stripe não envia JWT; a assinatura é verificada

supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SITE_URL=https://o-seu-dominio
```

No Stripe Dashboard, criar um webhook para `https://<ref>.supabase.co/functions/v1/payment-webhook` com os eventos:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`.

Para usar outro provider, implementar `PaymentProvider` em `supabase/functions/_shared/` e devolvê-lo em `getPaymentProvider()`.

Reembolsos: o estado `refunded` existe no schema, mas ainda não há handler de webhook para ele.

## Deploy do frontend

O build (`dist/`) é estático. Como a app é uma SPA, o alojamento tem de reencaminhar todas as rotas para `index.html`. Já estão incluídos:
- `public/_redirects` (Netlify) e `vercel.json` (Vercel);
- `public/robots.txt` (não indexa admin, área do cliente, carrinho, login).

Antes de publicar:
1. Definir no alojamento as variáveis públicas do `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, e os contactos públicos `VITE_WHATSAPP_PT`, `VITE_WHATSAPP_ES`, `VITE_CONTACT_EMAIL`, opcionalmente `VITE_CONTACT_PHONE`) e fazer o build lá (`npm run build`).
2. No Supabase, **Authentication → URL Configuration**: Site URL = domínio final; Redirect URLs = `<domínio>/login` e `<domínio>/reset-password` (manter também `http://localhost:5173/...` para desenvolvimento).
3. Com o domínio final: acrescentar `Sitemap:` ao `robots.txt` e, se desejado, `og:image` e `<link rel="canonical">` no `index.html`.

URLs oficiais: `/rastrear` (tracking; `/track` redireciona), `/pecas`, `/pedido` (redireciona para `/carrinho`).

## Pendente (depende de decisões externas)

- Textos legais (termos e privacidade): as páginas existem e mostram um aviso de "em preparação".
- Contactos: configurados no `.env` (email e WhatsApp PT/ES). Sem telefone fixo nem morada física (empresa online); `VITE_CONTACT_PHONE` fica vazio.
- Imagem Open Graph (`og:image`): ainda não definida.
- Fornecedor de IA e catálogo licenciado (contratos e credenciais) — ver `docs/catalog-and-ai.md`.
- Publicar `catalog-external` / `catalog-sync` quando houver um fornecedor com API.
- Carregar o primeiro catálogo real (docs/catalog-import.md → "Primeiro catálogo real") e, depois, apagar os dados DEMO.
- Adaptador TecDoc: preparado em `supabase/functions/_shared/catalog/adapters/tecdoc.ts`, implementar com a documentação do contrato TecAlliance.
- Pagamento online de pedidos de peças: os pedidos são confirmados pela equipa; o Stripe continua ligado apenas à taxa de rastreio.
