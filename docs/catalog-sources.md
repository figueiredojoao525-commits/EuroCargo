# Fontes de dados do catálogo (verificadas)

Registo das fontes avaliadas para encher o catálogo EuroCargo com **dados reais**, dentro de um
orçamento de **€0** e com **licenças que permitem utilização comercial**. Cada entrada foi
verificada na data indicada. **Nada aqui é assumido**: se uma licença não foi possível confirmar,
a fonte fica marcada como *não verificável* e **não** é usada.

> Conclusão curta (verificado a 2026-10-02): há **dados de veículos** abertos e abundantes
> (marcas / modelos / motorizações), já usados no projeto. **Não** existe, até à data, nenhuma
> fonte **gratuita, em massa e legalmente reutilizável** de **referências de peças** (OEM,
> cross-reference, compatibilidade peça↔veículo) — esse mercado é dominado por catálogos
> proprietários e pagos (ver "Descartadas"). O caminho real para peças reais é um **feed de
> fornecedor** importado com autorização (`docs/catalog-import.md`).

## 1. Fontes em uso (dados de veículos)

### Agência Europeia do Ambiente (EEA) — matrículas de veículos novos na UE
- **URL:** https://www.eea.europa.eu/en/datahub (CO2 emissions from new passenger cars)
- **Tipo de dados:** veículos — marca, modelo, motorização (combustível, cilindrada, potência). **Sem peças, preços ou stock.**
- **Registos confirmados:** no EuroCargo, 39 marcas / 474 modelos (ver `npm run check:catalog`).
- **Licença / uso comercial:** **CC BY 4.0** — permite uso comercial com atribuição.
- **Conta / chave:** não.
- **Limites:** nenhum (ficheiro aberto).
- **Atribuição:** obrigatória — já creditada no rodapé do site.
- **Uso gratuito em produção:** sim.
- **Verificado:** 2026-10-02.
- **Método de importação:** já integrado — `npm run vehicles:generate [-- --fetch]`
  (migração `20261006000000_vehicle_reference_eea`). Ver `docs/catalog-import.md` → "Veículos de referência".

### NHTSA vPIC — descodificação de VIN e marcas/modelos (EUA)
- **URL:** https://vpic.nhtsa.dot.gov/api/
- **Tipo de dados:** descodificação de VIN, marcas e modelos. VINs europeus → só fabricante fiável.
- **Registos confirmados:** API pública (sem limite documentado de registos); usada ao vivo no browser.
- **Licença / uso comercial:** obra do governo dos EUA — **domínio público**; uso comercial permitido.
- **Conta / chave:** não.
- **Limites:** uso razoável da API pública.
- **Atribuição:** não exigida.
- **Uso gratuito em produção:** sim.
- **Verificado:** 2026-10-02.
- **Método de importação:** já integrado — `src/services/vehicles/nhtsa.ts` (em tempo real, não importa em massa).

## 2. Fontes candidatas verificadas (não ainda integradas)

### VehiclesDB — dados abertos de veículos
- **URL:** https://github.com/vehiclesdb/vehiclesdb
- **Tipo de dados:** veículos — 918 marcas / 14 886 modelos (carros, motos, ciclomotores, carrinhas, camiões, autocarros), tipos de carroçaria, intervalos de anos. **Sem peças.**
- **Registos confirmados:** 14 886 modelos / 918 marcas (release 2026.09.1, verificado no README a 2026-10-02).
- **Formato:** CSV, JSON, Parquet, SQLite — download direto por CDN/GitHub.
- **Licença / uso comercial:** **CC BY 4.0** ("Data: CC-BY 4.0 — free for any use, including commercial").
- **Conta / chave:** não.
- **Limites:** nenhum.
- **Atribuição:** obrigatória — "Vehicle data by VehiclesDB" com ligação.
- **Uso gratuito em produção:** sim.
- **Verificado:** 2026-10-02.
- **Utilidade para o EuroCargo:** **baixa prioridade** — o projeto já tem veículos EEA (também CC BY 4.0)
  ligados às peças. Só valeria a pena para alargar a cobertura de marcas/modelos; exigiria mapear nomes
  às regras de `scripts/vehicle-reference/normalize.mjs`. Continua a **não** resolver o gap das peças.

### Registo de Type-Approval da UE (European Data Portal)
- **URL:** https://data.europa.eu/data/datasets/type-approval-register
- **Tipo de dados:** homologações de veículos, sistemas, **componentes** e unidades técnicas (fabricante, tipo, objeto da aprovação). **Não é um catálogo de peças com referências/compatibilidade comercial.**
- **Registos confirmados:** não quantificado nesta verificação.
- **Licença / uso comercial:** publicado em portal de dados abertos da UE (tipicamente CC BY 4.0) — **a confirmar na página do conjunto de dados antes de qualquer uso.**
- **Conta / chave:** não.
- **Verificado:** 2026-10-02 (apenas existência e âmbito; licença e formato **por confirmar**).
- **Utilidade:** potencial para dados de homologação de componentes, mas **não** fornece referências OEM
  prontas a vender. Classificar como "referência documentada", nunca como stock real.

## 3. O gap real: referências de peças

Peças reais exigem **referência do fabricante, referências OEM e compatibilidade comprovada**. A base de
dados padrão do pós-venda (**TecDoc / TecAlliance**) é proprietária e paga. Não foi encontrada nenhuma
alternativa **gratuita, legal e em massa**. Por isso:

- Os produtos reais entram por **feed de fornecedor** (ficheiro cedido pelo próprio fornecedor, com
  autorização), importado por `docs/catalog-import.md`. O importador já normaliza marcas, referências e
  OEM, deteta duplicados por `marca + referência + estado` e liga às motorizações EEA pelo nome.
- Enquanto não houver feed real, o catálogo mantém-se **DEMO** (759 produtos `is_demo`, 0 reais a
  2026-10-02) e **nunca** deve ser apresentado como stock comercial.

## 4. Descartadas (e porquê) — verificado 2026-10-02

| Fonte | Motivo do descarte |
|---|---|
| **TecDoc / TecAlliance** | Proprietária e paga. Regra €0. |
| **Apify "Auto Parts Catalog – TecDoc API alternative"** | Pago (US$69/mês + uso). Regra €0. |
| **cardatabases.com / usabledatabases.com / MOTOR** | Bases de dados comerciais pagas. |
| **modelpartfinder.com** | O domínio **não resolve (DNS) a 2026-10-02**; licença e dados **não verificáveis**. Não usar enquanto não for confirmável. |
| **Repositórios GitHub "tecdoc-*"** | Ou são só código de aplicação que depende de uma **API paga** (ex.: `ronhartman/tecdoc-autoparts-catalog` → `apiprofile.com`), ou contêm dados **raspados** do TecDoc (violação de direitos de base de dados/autor). Não reutilizáveis. |

**Regras seguidas:** não assumir que um repositório público permite uso comercial; não raspar lojas ou
catálogos protegidos; não usar chaves de demonstração partilhadas; descartar e documentar qualquer fonte
que exija pagamento.

## 5. Próxima ação concreta

1. Obter um **ficheiro real de um fornecedor** (CSV/JSON/XML) com autorização de uso.
2. Validar offline: `npm run import:catalog -- ficheiro.csv --dry-run --default-condition new --report erros.csv`.
3. Rever a pré-visualização, importar uma **amostra pequena** e confirmar com `npm run check:catalog`.
4. Só depois escalar para o catálogo completo e, aí sim, apagar/ocultar os dados DEMO.
