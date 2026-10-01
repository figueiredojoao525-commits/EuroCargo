# Importação de catálogo (CSV / JSON / XML / API)

Admin → **Catálogo → Importação** (`/admin/catalog/import`) ou, para ficheiros grandes, a linha de comandos
`npm run import:catalog`. Requer as migrações `20261002000000_catalog_scale_import` e
`20261003000000_catalog_import_match_fix` aplicadas.

## Primeiro catálogo real — passo a passo

1. **Uma fonte por fornecedor** — Admin → Catálogo → Providers → novo: chave `fornecedor-x` (fica como origem
   dos produtos), tipo "Ficheiros", utilização "Importação", **ativa**, fornecedor associado, **estado por
   omissão** (ex.: "Nova" se o ficheiro não tiver coluna de estado), moeda por omissão e, se o fornecedor
   autorizar as imagens, a **licença das imagens**. (A fonte genérica "ficheiros" também serve, mas sem estado
   por omissão as linhas sem coluna de estado são rejeitadas.)
2. **Regras de margem** antes de importar custos (Admin → Preços): sem regra, os produtos com custo e sem PVP
   ficam "sob consulta".
3. **Ficheiro** — exportação do fornecedor ou o [modelo CSV](../public/templates/modelo-importacao-eurocargo.csv)
   (botão "Descarregar modelo CSV" na página de importação). Exemplo realista completo:
   [examples/exemplo-fornecedor.csv](examples/exemplo-fornecedor.csv).
4. **Validar sem gravar**: `npm run import:catalog -- ficheiro.csv --dry-run --default-condition new --report erros.csv`
   (offline; não precisa de credenciais) ou o passo de pré-visualização na página.
5. **Importar** — na página (até 50 MB) ou na linha de comandos (sem limite prático; ver abaixo).
6. **Confirmar** — `npm run check:catalog`, pesquisar na loja e ver o histórico de importações.
7. Quando o catálogo real estiver carregado: **Admin → Preços → Apagar dados de demonstração** (os testes
   automáticos passam a ignorar a parte DEMO).

Voltar a importar o mesmo ficheiro (ou uma versão atualizada) **atualiza** os produtos — nunca duplica.

## Regras

- **Nada é inventado.** Um valor em falta fica vazio; um valor que não se percebe é assinalado e ignorado
  (ou a linha é rejeitada, se for obrigatório).
- **Preço público**: só é gravado se o ficheiro o trouxer (coluna "Preço"/"PVP"). Se trouxer apenas o
  **custo do fornecedor**, o produto fica `price_mode = rules` e o preço é calculado pelas regras de margem
  (Admin → Preços). Sem regra aplicável, o preço fica vazio ("sob consulta").
- **Custo, fornecedor, referência do fornecedor e URL de origem** vão para `supplier_products` (só admins).
  Nunca aparecem no site.
- **Vários fornecedores, um produto**: o ficheiro do fornecedor B com a mesma marca + referência que o do
  fornecedor A acrescenta uma segunda oferta ao mesmo produto (não cria outro). O "Código artigo" de cada
  fornecedor identifica a sua oferta nas reimportações. O sistema escolhe a melhor oferta e agrega o stock.
- **Ficheiros de fornecedor**: a coluna de preço de um fornecedor é normalmente o **custo** para a EuroCargo —
  na correspondência de colunas, atribua-a a "Custo do fornecedor", não a "Preço público". O preço público
  (preço EuroCargo) vem das regras de margem.
- **Imagens**: só URLs `https://` **com licença** (coluna "Licença" ou a licença por omissão da fonte).
  O importador guarda o URL; não descarrega nem copia imagens de terceiros. O URL original fica em
  `product_image_sources` (só admins). O crédito da imagem só é preenchido se o ficheiro o indicar — nunca
  com o nome do fornecedor. Produtos sem imagem mostram uma **imagem ilustrativa** da categoria.
- **Sem duplicados**: um produto é reconhecido por, nesta ordem: ID na fonte (`external_id`, ex.: "Código
  artigo" do fornecedor), SKU, ou marca + referência + estado. Linhas repetidas do mesmo produto no ficheiro
  (ex.: uma linha por veículo) são agrupadas num só produto com todos os veículos, imagens e OE.
- **Atualizações de preço/stock** sem coluna de estado (só marca + referência + custo/stock): atualizam o
  produto quando há um só com essa marca e referência. Se a mesma peça existir nova **e** usada, a linha é
  rejeitada (`ambiguous_condition`) — indique o estado ou use o "Código artigo".
- Produtos DEMO nunca são alterados por uma importação.
- Cada linha é importada na sua própria transação: uma linha errada não impede as outras.

## Passos

1. **Fonte** — cada importação pertence a uma fonte (Admin → Catálogo → Providers). A chave da fonte fica
   em `products.data_source` (é a "origem dos dados" mostrada na página do produto). A fonte pode definir
   estado, moeda e licença de imagens por omissão.
2. **Ficheiro** — até 50 MB no navegador. Para feeds maiores use a sincronização por API (abaixo).
3. **Correspondência de colunas** — reconhecida automaticamente (nomes em PT/ES/EN/FR/DE/IT); pode ajustar.
4. **Pré-visualização / validação** — erros (linha não importada) e avisos por linha.
5. **Importar** — envio em blocos de 200 linhas, com progresso e possibilidade de parar.
6. **Histórico** — últimas importações e data da última sincronização de cada fonte.

Modos: **Criar e atualizar** (padrão), **Só criar novos**, **Só atualizar existentes** (útil para
atualizações de preço/stock: aí o nome e o estado não são obrigatórios). Ao atualizar, os campos ausentes
no ficheiro mantêm o valor atual.

Opção "Criar marcas, categorias, veículos e fornecedores que ainda não existam": quando desligada, valores
desconhecidos ficam como aviso (o produto é importado sem essa ligação).

## Campos

| Campo | Exemplos de nome de coluna | Notas |
|---|---|---|
| `external_id` | id, article_id, id_externo | ID do artigo na fonte (melhor chave para sincronizar) |
| `sku` | sku, codigo_interno | SKU interno EuroCargo |
| `reference` | referência, ref, part_number, artikelnummer, mpn | Referência do fabricante |
| `oe_numbers` | oe, oem, referencias_oe | Lista: separada por `;` `\|` `,` ou elementos repetidos |
| `ean` | ean, gtin, barcode | 8–14 dígitos |
| `cross_references` | equivalencias | Lista de `{reference, brand}` (JSON/XML) ou texto |
| `name` | nome, nombre, designação, title | Obrigatório para criar |
| `description` | descrição | |
| `brand` | marca, brand, marke | Marca da peça |
| `manufacturer` | fabricante | |
| `category` | categoria, familia | Hierarquia com `>`: `Travagem > Pastilhas` |
| `condition` | estado, condição | novo/nova/new/nuevo/neu… · usado/used/usado/gebraucht… — obrigatório (ou estado por omissão da fonte) |
| `price` | preço, pvp, precio | Preço **público**. `12,50` · `1.234,56` · `1,234.56` |
| `currency` | moeda, currency | ISO 4217 (EUR) |
| `stock` | stock, quantidade, qty | Inteiro ≥ 0 |
| `availability` | disponibilidade | em stock / esgotado / por encomenda / sob consulta (senão deduz do stock) |
| `lead_time_days` | prazo, lead_time | Dias |
| `active` | ativo | sim/não, 1/0 |
| `supplier` | fornecedor, proveedor | **Interno** |
| `supplier_reference` | ref_fornecedor, supplier_sku | **Interno** |
| `cost` | custo, coste, purchase_price | **Interno**; o preço público vem das regras |
| `cost_currency` | moeda_custo | |
| `supplier_url` | url, link, url_fornecedor | **Interno** |
| `images` | imagem, imagens, image_url | Uma ou várias (lista) |
| `image_alt`, `image_license` | alt, licença | Aplicam-se às imagens da linha |
| `vehicles` | veiculos, compatibilidade | Lista estruturada (JSON/XML) |
| `vehicle_make` … `vehicle_position` | marca veículo, modelo, geração, versão, código motor, combustível, cilindrada, kw, cv, ano de, ano até, anos, posição | Um veículo por linha (repita a linha para mais veículos) |
| `source_updated_at` | updated_at, ultima_atualizacao | Data ISO |

Combustível aceite: gasolina, gasóleo/diesel, híbrido, elétrico, GPL (e equivalentes noutras línguas).
Anos: `2004-2008`, `05/2004 - 12/2008`, `2010-` (desde), `-1999` (até).

## Formato exato aceite

- **Cabeçalho obrigatório** (CSV) — uma linha com os nomes das colunas. A ordem é livre; colunas desconhecidas
  são ignoradas (e mostradas como "ignorar" na correspondência, onde podem ser atribuídas a um campo).
- **Identificação mínima por linha**: `Código artigo` (ID na fonte) **ou** `SKU` **ou** `Referência` + `Marca`.
- **Para criar um produto**: também `Nome` (ou só `Descrição`, que é usada como nome) e `Estado` (ou estado por
  omissão da fonte).
- **Números**: `12,50` · `1.234,56` · `1,234.56` · `12.5` (símbolo € aceite). **Datas**: ISO (`2026-09-28`).
- **Listas** numa célula: separadas por `|` ou `;` (CSV com `;` como separador: use `|`). Várias colunas do
  mesmo tipo também servem: `Imagem 1`, `Imagem 2`, `OE 1`, `OE 2`…
- **Categoria**: `Família` + `Subfamília` (duas colunas) ou `Travagem > Pastilhas` numa coluna.
- **Equivalências**: `MARCA:REFERÊNCIA|MARCA:REFERÊNCIA` (a marca é opcional).
- **Veículos**: uma linha por veículo (repetindo os dados do produto) ou, em JSON/XML, uma lista.
- **Codificação**: UTF-8 (o Excel "CSV UTF-8" serve).

Modelo com todas as colunas reconhecidas: [`public/templates/modelo-importacao-eurocargo.csv`](../public/templates/modelo-importacao-eurocargo.csv)

```
Código artigo;SKU;Referência;Marca;Nome;Descrição;Família;Subfamília;Estado;Preço;Moeda;Stock;Disponibilidade;
Prazo entrega;OE;EAN;Equivalências;Fornecedor;Ref fornecedor;Custo;URL fornecedor;Imagem 1;Imagem 2;Licença imagem;
Marca veículo;Modelo;Geração;Versão;Código motor;Combustível;Cilindrada;kW;CV;Ano de;Ano até;Posição;Ativo;
Última atualização
```

## Linha de comandos (ficheiros grandes)

```bash
# Validar (offline, sem credenciais): resumo, ocorrências por tipo, primeiros erros e relatório CSV
npm run import:catalog -- catalogo.csv --dry-run --default-condition new --report erros.csv

# Importar (conta de administrador em .env.local, nunca no .env público):
#   ADMIN_EMAIL=admin@…   ADMIN_PASSWORD=…
npm run import:catalog -- catalogo.csv --source fornecedor-x --report erros.csv
```

Opções: `--source <chave>` (padrão `ficheiros`), `--mode upsert|insert_only|update_only`, `--no-create`,
`--record-tag <elemento XML>`, `--mapping mapa.json` (`{"Coluna": "campo"}` para corrigir a correspondência),
`--chunk <n>`. Ctrl+C para depois do bloco atual (o que já foi enviado fica importado; voltar a correr não
duplica).

Usa a chave pública + login de administrador: a base de dados verifica `is_admin()` como na página.
Nenhuma chave secreta é necessária.

## Desempenho

- Leitura + validação: ~200 000 linhas em ~5 s.
- Gravação: blocos de 200 linhas, cada um numa transação; se o Supabase cortar um pedido por tempo (limite
  de ~8 s por pedido), o bloco é reduzido para metade e repetido automaticamente — nada fica duplicado nem
  meio gravado.
- Referência medida em Postgres local (WASM, mais lento que o Supabase): ~110 produtos/s com veículo,
  fornecedor e custo — 100 000 produtos ≈ 15 min. Atualizações são mais rápidas.

## Formatos

Exemplos completos (apenas formato, sem produtos reais) em [docs/examples/](examples/):

- **CSV** — separador `,` `;` tab ou `|` (detetado), aspas `"` com `""` para aspas literais, UTF-8 (com ou
  sem BOM). Primeira linha = cabeçalho. Ver `catalogo-exemplo.csv` (uma linha por veículo).
- **JSON** — lista de objetos, ou objeto com a lista em `items` / `products` / `data` / `articles`.
  Ver `catalogo-exemplo.json` (veículos e imagens como listas de objetos).
- **XML** — elementos repetidos (ex.: `<produtos><produto>…</produto></produtos>`); o elemento é detetado
  automaticamente ou indicado no campo "Elemento XML". Atributos e sub-elementos tornam-se campos;
  sub-elementos repetidos tornam-se listas. Ver `catalogo-exemplo.xml`.

## API / feed REST (sincronização incremental)

Para catálogos grandes ou atualizações automáticas, a Edge Function **`catalog-sync`** lê um fornecedor
página a página e usa o mesmo importador (service_role). Retoma do cursor guardado em
`catalog_sources.sync_cursor`.

O adaptador genérico `eurocargo-feed` implementa este contrato (o fornecedor ou um pequeno middleware
expõe-no):

```
GET {CATALOG_API_URL}/products?cursor=<cursor>&limit=<n>     Authorization: Bearer {CATALOG_API_KEY}
→ { "items": [ <linha canónica, como no JSON acima> ], "next_cursor": "<cursor>" | null }

GET {CATALOG_API_URL}/search?q=&reference=&oe=&make=&model=&year=&fuel=&engine_cc=&engine=&limit=
→ { "items": [ ... ] }                                         (modo "live")

GET {CATALOG_API_URL}/vehicles/vin/{vin}                      (só se o fornecedor oferecer VIN)
→ { "vehicles": [ { "make", "model", "variant", "year", "engine_code", "fuel" } ] }
```

`next_cursor = null` indica o fim da passagem; o último cursor é mantido para que a próxima execução peça
apenas as alterações seguintes.

Configuração:

```bash
supabase secrets set CATALOG_PROVIDER=eurocargo-feed CATALOG_API_URL=https://… CATALOG_API_KEY=…
supabase functions deploy catalog-sync
supabase functions deploy catalog-external
```

Depois, em Admin → Catálogo → Providers: criar a fonte (tipo "API / feed REST", utilização "Importação",
capacidade `sync`, adaptador `eurocargo-feed`), ativá-la e usar **Sincronizar agora**. Para sincronizar
automaticamente, agendar um `POST` à função com a chave service_role (ex.: Supabase Cron + pg_net):

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/catalog-sync',
  headers := jsonb_build_object('Authorization', 'Bearer <service_role key>', 'Content-Type', 'application/json'),
  body := jsonb_build_object('source', 'fornecedor-x', 'max_pages', 20)
);
```

(Guardar a chave service_role no Vault do Supabase, não em texto no SQL.)

## Linha canónica (para quem escreve um adaptador)

O tipo `ImportRow` em `supabase/functions/_shared/catalog/types.ts` (servidor) e
`src/services/catalogImport/mapping.ts` (site) descreve a linha que `catalog_import_rows()` aceita. O
comentário no topo das funções de importação, em
`supabase/migrations/20261002000000_catalog_scale_import.sql`, lista todos os campos.
