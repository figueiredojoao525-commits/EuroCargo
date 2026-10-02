# Fotografias do catálogo

Como o EuroCargo mostra, importa e mantém as fotografias das peças — sem custos e sem inventar nada.

## Os três níveis de imagem

| Nível | O que é | Onde fica | Como aparece no site |
|---|---|---|---|
| **1. Fotografia própria (exata)** | Foto da peça concreta: própria da EuroCargo, do feed de um fornecedor ou licenciada | Supabase Storage, bucket `product-images` (`products/<id-do-produto>/<hash>-1200.webp` + `-480.webp`) e tabela `product_images` | Foto normal, com crédito/licença na página do produto |
| **2. Fotografia ilustrativa** | Foto do **tipo** de peça (ex.: pastilhas de travão), de licença livre (Wikimedia Commons) | `public/images/illustrative/<tipo>-400.webp` / `-800.webp` (servidas pela Vercel com o site) | Etiqueta **«Imagem ilustrativa»** sobre a foto e, na página do produto, o aviso «não é a fotografia do produto exato» + autor, licença e ligação à origem |
| **3. Ilustração desenhada** | O ícone da categoria (já existia) | código do site | «Imagem ilustrativa» |

O site usa sempre o primeiro nível disponível; se uma imagem não carregar, passa automaticamente para o seguinte.
Os cartões e o assistente carregam a versão pequena (400/480 px) e só quando aparecem no ecrã (*lazy loading*);
a página do produto carrega a versão grande.

**Regra:** uma fotografia só é «exata» quando há prova de que é daquela peça — o nome do ficheiro (ou o mapa CSV)
contém uma referência que pertence a **um único** produto (SKU, referência do fabricante, EAN ou OE), ou vem do
feed do fornecedor desse produto. Tudo o resto é ilustrativo ou fica pendente.

Produtos DEMO nunca recebem fotografias exatas (a importação ignora-os, salvo `--allow-demo`): as suas
referências são fictícias e a foto de uma peça real faria um produto de demonstração parecer real.

## Ferramentas

Todas correm no computador, com `npm run …`, e usam só a chave pública do `.env`. As que **escrevem** (carregar
fotos) entram com uma conta de **administrador**: crie um ficheiro `.env.local` (nunca vai para o Git) com

```
ADMIN_EMAIL=o-seu-email-de-administrador
ADMIN_PASSWORD=a-sua-palavra-passe
```

Nenhuma ferramenta usa a chave secreta (`service_role`): o Supabase continua a aplicar as regras de segurança
(RLS, `is_admin()`), tal como no painel de administração.

| Comando | Faz | Escreve? |
|---|---|---|
| `npm run images:report` | Lista produtos com foto própria, com foto ilustrativa (do tipo ou da categoria) e sem foto → `images-work/report/products.csv` | não |
| `npm run images:report -- --missing` | Só os produtos sem foto própria → `images-work/report/products-missing.csv` | não |
| `npm run images:import -- <pasta> --dry-run` | Analisa uma pasta de fotos: correspondência por referência, validação, duplicados, otimização → `images-work/import/report.csv` | não |
| `npm run images:import -- <pasta> --license "…"` | O mesmo, e carrega as fotos exatas no Storage e associa-as aos produtos | sim (admin) |
| `npm run images:find` | Procura no Wikimedia Commons fotos com a referência exata de produtos reais sem foto → `images-work/find/candidates.csv` (só sugestões, nada é associado) | não |
| `npm run images:illustrative -- candidates` / `build` | Mantém as fotos ilustrativas por tipo de peça (ver abaixo) | ficheiros locais do site |

`images-work/` é a pasta de trabalho (descargas, manifestos, relatórios) e não vai para o Git.

## Adicionar uma pasta de fotografias (passo a passo)

1. **Junte as fotos numa pasta** (pode ter subpastas). Formatos: JPG, PNG, WebP, AVIF, TIFF, HEIC. Mínimo 300 px
   no lado menor. Só fotos **próprias** ou com **autorização escrita** do fornecedor/fabricante.
2. **Dê a cada foto o nome da referência da peça**, tal como está no catálogo:
   - `0986494123.jpg` — referência do fabricante, SKU, EAN ou número OE (espaços, pontos e hífenes são ignorados:
     `0 986 494 123.jpg` também serve);
   - mais fotos da mesma peça: `0986494123__2.jpg`, `0986494123_2.jpg` ou `0986494123 (2).jpg`
     (a primeira passa a ser a principal).
   - Se as fotos tiverem nomes da câmara (`IMG_0001.jpg`), crie um `mapa.csv`:
     ```
     ficheiro;referencia
     IMG_0001.jpg;0986494123
     IMG_0002.jpg;1K0 698 151
     ```
     e acrescente `--map mapa.csv`.
3. **Simule primeiro:**
   ```
   npm run images:import -- C:\fotos\lote1 --dry-run
   ```
   Abra `images-work/import/report.csv`. Estados possíveis:
   - `pronta (exata)` — vai ser carregada;
   - `sem correspondência` — a referência não existe no catálogo (corrija o nome do ficheiro);
   - `ambíguo (pendente)` — a referência pertence a vários produtos (use a referência mais específica, ex. o SKU);
   - `demo (ignorado)` — corresponde a um produto DEMO;
   - `rejeitada` — ficheiro inválido ou demasiado pequeno; `duplicada` — a mesma imagem repetida.
   Para um primeiro teste pequeno use `--limit 20`.
4. **Importe:**
   ```
   npm run images:import -- C:\fotos\lote1 --license "Fotografia própria EuroCargo"
   ```
   (para fotos de um fornecedor: `--license "Licenciado por <fornecedor>" --source "Fornecedor"` — o texto de
   `--source` aparece como crédito na página; não ponha o nome do fornecedor se não o quiser mostrar).
5. **Confirme:** `npm run images:report` e veja os produtos na loja.

Pode repetir a importação as vezes que quiser: cada foto é identificada pelo conteúdo (SHA-256), o progresso fica
em `images-work/import/manifest.json`, nada é sobrescrito no Storage e cada imagem só é associada uma vez. Se a
importação for interrompida, basta voltar a correr o mesmo comando.

**O que a otimização faz:** roda conforme a orientação da câmara, remove metadados (incluindo GPS), reduz para
1200 px e 480 px (nunca aumenta) e converte para WebP. Medido: uma foto de 10,9 MB (3800×2533) ficou em
417 + 56 KB; uma de 1,4 MB ficou em 134 + 21 KB. Fotos de peças em fundo liso ficam normalmente abaixo disto.

### Fotos que vêm nos ficheiros dos fornecedores

Se o ficheiro do fornecedor tiver URLs de imagens (coluna «Imagem», com a licença em «Licença imagem»), a importação de catálogo já as
associa aos produtos (ver [catalog-import.md](catalog-import.md)), com a licença da fonte
(`catalog_sources.image_license`). Use esta via quando o contrato com o fornecedor autoriza mostrar as imagens.

## Corrigir uma associação errada

**Admin → Produtos → (produto) → Imagens:** remover a imagem, carregar outra ou escolher a principal
(«Tornar principal»). Remover a associação não apaga o ficheiro do Storage: para libertar espaço, apague-o
em Supabase → Storage → `product-images` → `products/<id-do-produto>/`. Depois, corrija o nome do ficheiro na
pasta e volte a importar.

## Fotografias ilustrativas (manutenção)

- Cada produto é ligado a um **tipo de peça** pela categoria e pelo nome (`src/utils/partTypes.ts`); se o tipo não
  tiver foto, usa a de outro tipo da mesma categoria; se a categoria não tiver nenhuma, mostra o desenho.
- As fotos escolhidas estão em `scripts/images/illustrative-selection.json` (tipo → ficheiro do Commons); os créditos
  vão para `src/data/illustrative-images.json` e são mostrados no site.
- Só se aceitam licenças que permitem uso comercial com crédito: **CC0, domínio público, CC BY, CC BY-SA**
  (nunca NC/ND, nem ficheiros com restrições de marca/pessoas). A licença é verificada de novo em cada `build`.
- Para trocar ou acrescentar uma foto:
  1. `npm run images:illustrative -- candidates --only brake-pads` → abra
     `images-work/illustrative/sheet-*.html` no browser e escolha;
  2. ponha o título (`File:…`) em `illustrative-selection.json`;
  3. `npm run images:illustrative -- build`, confirme as imagens em `public/images/illustrative/` e publique.
- Tipos ainda sem foto livre adequada (usam a foto da categoria): bomba de direção assistida, rótula, rolamento de
  roda, bomba de água, correia de acessórios, junta da tampa das válvulas, radiador, condensador de A/C.

## Armazenamento, tráfego e custos

Preços verificados a 2026-10-02 (confirme em supabase.com/pricing e vercel.com/docs/limits):

| Serviço | Gratuito | Uso atual |
|---|---|---|
| Supabase Storage (plano Free) | 1 GB de ficheiros, 5 GB/mês de tráfego (+5 GB em cache); **sem transformações de imagem** (por isso as fotos são otimizadas antes de carregar). No plano Free não há cobrança: se a quota for ultrapassada, o serviço é restringido | 0 fotos próprias |
| Vercel (fotos ilustrativas) | 100 GB/mês de transferência no plano Hobby | 42 fotos (84 ficheiros), 2,4 MB no total (~10–40 KB por miniatura) |

Estimativas: cada foto própria ocupa ~150–470 KB (as duas versões) → **1 GB ≈ 2 000–6 000 fotos**. Uma página
da loja carrega 12 miniaturas de ~20–55 KB (~0,3–0,7 MB) → 5 GB/mês ≈ 7 000–15 000 páginas da loja vistas.

**Acompanhar:** Supabase → Project → *Usage* (Storage size, Egress) e Vercel → *Usage* (Fast Data Transfer).

**Evitar custos inesperados:**
- não ative o plano Pro do Supabase (25 USD/mês) nem a faturação sem decidir; no Free nada é cobrado;
- importe sempre com `--dry-run` primeiro e use `npm run images:report` para não carregar fotos repetidas;
- não ative «Image Transformations» do Supabase nem a otimização de imagens da Vercel (são pagas / limitadas);
- não carregue fotos originais sem passar pela ferramenta (ficariam 10–30× maiores).

**Atenção (Vercel):** as regras atuais da Vercel indicam que o plano Hobby é para uso pessoal não comercial;
um site de venda deve usar o plano Pro. Isto não depende das imagens, mas convém decidir antes de vender.
