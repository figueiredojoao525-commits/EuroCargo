# Qualidade dos dados do catálogo

Regras de validação, deduplicação e compatibilidade aplicadas a **todos** os produtos reais, no
importador (`src/services/catalogImport/`, `scripts/import-catalog.mjs`) e na base de dados
(`catalog_import_one` e funções associadas). Complementa `docs/catalog-import.md` (como importar) e
`docs/catalog-sources.md` (de onde vêm os dados).

## Princípio-base

**Nada é inventado.** Um valor em falta fica **vazio**; um valor que não se percebe é **assinalado e
ignorado** (ou a linha é rejeitada, se o campo for obrigatório). Nunca se preenche preço, stock,
fornecedor, OEM ou compatibilidade por suposição.

## 1. Validação de campos

- **Obrigatórios:** `reference` (referência do fabricante) **e** `name`. Sem um deles, a linha é
  rejeitada e vai para o relatório de erros.
- **Estado (`condition`):** tem de ser `novo`, `usado` ou `recondicionado` (reconhece PT/ES/EN/FR/DE/IT).
  Se o ficheiro não trouxer coluna de estado, usa-se o **estado por omissão** da fonte
  (`--default-condition`); sem ele, a linha é rejeitada.
- **Números** (`price`, `cost`, `stock`, `cilindrada`, `kW`, `CV`, anos): aceitam vírgula ou ponto
  decimal; valores não numéricos são assinalados e o campo fica vazio (não param a linha, salvo se crítico).
- **Preço público:** só é gravado se vier no ficheiro. Se vier só o **custo**, o produto fica
  `price_mode = rules` e o preço é calculado pelas regras de margem; sem regra, fica "sob consulta".
- **Imagens:** uma imagem sem **licença** gera o aviso `image_without_license`; a imagem é guardada mas
  tratada como não-utilizável até a licença ser confirmada (ver `docs/images.md`).

## 2. Normalização

Antes de comparar ou gravar, normaliza-se de forma consistente com a base de dados:

- **Referências / OEM** — `normalize_ref` (igual no SQL e nos testes): maiúsculas, sem espaços nem traços
  supérfluos, para que `"1234 AB-5"`, `"1234AB5"` e `"1234-ab5"` sejam a mesma referência.
- **Marcas, categorias, nomes** — espaços colapsados, acentos tratados; cabeçalhos reconhecidos em
  seis idiomas + nomes comuns de feeds (`src/services/catalogImport/fields.ts`).
- **Categoria** aceita `"Família > Subfamília"` e junta colunas múltiplas por ordem.
- **Unidades** — cilindrada em cc, potência em kW **e** CV (convertidas/aceites conforme a coluna).

## 3. Deduplicação (nunca duplicar; nunca confundir)

Ao importar, cada linha é comparada com produtos existentes **por esta ordem** (a primeira que casa vence):

1. **Código de artigo do fornecedor** (dentro da mesma fonte);
2. **`external_id` / source id** (dentro da mesma fonte);
3. **SKU**;
4. **`marca + referência + estado`** (`brand + reference + condition`).

Consequências:

- Reimportar o mesmo ficheiro (ou uma versão atualizada) **atualiza** o produto — não cria outro.
- A **mesma referência de fabricantes diferentes** gera produtos **diferentes** (a marca entra na chave),
  por isso referências iguais de marcas distintas nunca são fundidas.
- **Vários fornecedores, um produto:** o ficheiro do fornecedor B com a mesma `marca + referência` que o
  do fornecedor A acrescenta uma **segunda oferta** (`supplier_products`) ao mesmo produto, não um
  produto novo. A melhor oferta é escolhida por `catalog_refresh_offers`.
- Várias linhas do mesmo ficheiro com a mesma chave e veículos diferentes são **agrupadas** num só
  produto (aviso `merged_into_line`), uma linha por compatibilidade.

## 4. Compatibilidade de veículos

- A compatibilidade liga a peça às **motorizações reais** (dados EEA, ver `docs/catalog-sources.md`) pelo
  **mesmo nome** de marca + modelo (+ versão/código de motor quando fornecidos). Modelos que não existam
  na referência continuam a ser criados como antes, a partir do ficheiro.
- **Confirmada vs sugerida:** só é **confirmada** a compatibilidade que vem explícita no feed do
  fornecedor (ou numa fonte com licença que o permita). Nunca se declara uma peça compatível com um
  veículo **apenas** por pertencerem à mesma categoria.
- Fora dos anos de produção do veículo → a peça **não** aparece para esse veículo.
- Quando a fonte não permite confirmar a compatibilidade, essa **limitação é apresentada ao utilizador**
  em vez de se inventar uma ligação.

## 5. Separação real / referência / DEMO

- **Real** — produto confirmado por feed de fornecedor (`data_source` do fornecedor; `is_demo = false`).
- **Referência documentada** — existência documentada mas **sem stock/preço confirmado**: entra sem
  preço/stock (campos vazios), nunca como disponível para venda.
- **DEMO** — `is_demo = true` (SKUs `DEMO-*`, `DM-*`, `data_source = 'demo'`): só para teste/apresentação.
  O código do catálogo real **nunca** cria, altera nem funde linhas DEMO; os produtos reais nunca são
  marcados DEMO. Dados DEMO são ocultáveis (`admin_set_demo_visibility`) ou removíveis
  (`admin_purge_demo_data`) — ver `docs/catalog-import.md`.

## 6. Origem e rastreabilidade

Cada produto real guarda, quando disponível: **fonte** dos dados, **fornecedor**, **data de importação**
(`source_updated_at`) e **licença** (dados e imagens). Campos internos (fornecedor, custo, margem,
referência do fornecedor, URL de origem) ficam em `supplier_products` e **nunca** são legíveis por
clientes (RLS + privilégios de coluna; validado por `npm run check:catalog` e `npm run check:supabase`).

## 7. Verificação

- `npm run import:catalog -- ficheiro.csv --dry-run --default-condition new --report erros.csv`
  — valida sem gravar e exporta os erros (offline, sem credenciais).
- `npm test` — casos normais, dados inválidos, duplicados, reimportação, falhas parciais, ficheiros grandes.
- `npm run check:catalog` — invariantes do catálogo como visitante anónimo (nada inventado, DEMO intacto,
  colunas internas invisíveis).
