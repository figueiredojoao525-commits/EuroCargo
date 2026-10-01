import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { CrudManager, type CrudField } from '../../components/admin/CrudManager'
import { Spinner } from '../../components/Spinner'
import { DemoBadge } from '../../components/shop/Badges'
import { useAsync } from '../../hooks/useAsync'
import { interpolate } from '../../i18n'
import { useI18n } from '../../i18n/context'
import {
  deletePriceRule,
  getOfferStrategy,
  listCategoriesAdmin,
  listPriceRules,
  listSuppliers,
  OFFER_STRATEGIES,
  purgeDemoData,
  recalculateAllPrices,
  setDemoVisibility,
  refreshAllOffers,
  saveOfferStrategy,
  savePriceRule,
  type OfferStrategy,
} from '../../services/adminCatalog'
import { getErrorMessage } from '../../services/errors'
import { PRICE_RULE_SCOPES, type PriceRule } from '../../types'

/** /admin/pricing — margin rules (cost → public price) and bulk tools. */
export function AdminPricingPage() {
  const { t } = useI18n()
  const rules = useAsync(listPriceRules, [])
  const suppliers = useAsync(listSuppliers, [])
  const categories = useAsync(listCategoriesAdmin, [])
  const strategy = useAsync(getOfferStrategy, [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [confirmPurge, setConfirmPurge] = useState(false)

  const scope = (draft: Record<string, unknown>) => String(draft.scope)
  const fields: CrudField<PriceRule>[] = [
    {
      key: 'name',
      label: t.adminCommon.name,
      required: true,
      maxLength: 120,
      column: true,
      render: (r) => (
        <>
          {r.name} {r.is_demo && <DemoBadge />}
        </>
      ),
    },
    {
      key: 'scope',
      label: t.adminPricing.scope,
      type: 'select',
      required: true,
      initial: 'global',
      column: true,
      options: PRICE_RULE_SCOPES.map((s) => ({ value: s, label: t.adminPricing.scopes[s] })),
    },
    {
      key: 'category_id',
      label: t.shop.category,
      type: 'select',
      required: true,
      showIf: (d) => scope(d) === 'category',
      options: (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: 'supplier_id',
      label: t.adminNav.suppliers,
      type: 'select',
      required: true,
      showIf: (d) => scope(d) === 'supplier',
      options: (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: 'condition',
      label: t.shop.condition,
      type: 'select',
      required: true,
      showIf: (d) => scope(d) === 'condition',
      options: [
        { value: 'new', label: t.condition.new },
        { value: 'used', label: t.condition.used },
      ],
    },
    {
      key: 'product_id',
      label: t.adminPricing.productId,
      required: true,
      hint: t.adminPricing.productIdHint,
      showIf: (d) => scope(d) === 'product',
    },
    { key: 'min_cost', label: t.adminPricing.minCost, type: 'number', showIf: (d) => scope(d) === 'price_band' },
    { key: 'max_cost', label: t.adminPricing.maxCost, type: 'number', showIf: (d) => scope(d) === 'price_band' },
    {
      key: 'margin_percent',
      label: t.adminPricing.margin,
      type: 'number',
      required: true,
      initial: '30',
      column: true,
      render: (r) => `${r.margin_percent} %`,
    },
    { key: 'fixed_amount', label: t.adminPricing.fixed, type: 'number', initial: '0', column: true },
    {
      key: 'priority',
      label: t.adminPricing.priority,
      type: 'number',
      initial: '0',
      hint: t.adminPricing.priorityHint,
    },
    { key: 'active', label: t.adminCommon.active, type: 'checkbox', initial: true, column: true },
  ]

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ tone: 'success', text: await action() })
    } catch (err) {
      setMessage({ tone: 'error', text: getErrorMessage(err, t) })
    } finally {
      setBusy(false)
      setConfirmPurge(false)
    }
  }

  return (
    <>
      <h1>{t.adminNav.pricing}</h1>
      <p className="muted">{t.adminPricing.intro}</p>

      <section className="card pricing-example">
        <h2 className="card-title">{t.adminPricing.howTitle}</h2>
        <p>{t.adminPricing.howText}</p>
        <p className="muted small">{t.adminPricing.privacy}</p>
      </section>

      {strategy.data !== undefined && (
        <section className="card mt">
          <h2 className="card-title">{t.adminOffers.strategy}</h2>
          {strategy.data === null ? (
            <p className="muted">{t.adminOffers.migrationMissing}</p>
          ) : (
            <>
              <p className="muted small">{t.adminOffers.strategyHint}</p>
              <div className="inline-actions">
                <select
                  aria-label={t.adminOffers.strategy}
                  value={strategy.data}
                  disabled={busy}
                  onChange={(e) =>
                    run(async () => {
                      await saveOfferStrategy(e.target.value as OfferStrategy)
                      strategy.reload()
                      return t.adminOffers.saved
                    })
                  }
                >
                  {OFFER_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {t.adminOffers.strategies[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await refreshAllOffers()
                      return interpolate(t.adminOffers.refreshed, { count: String(r.products) })
                    })
                  }
                >
                  {t.adminOffers.refreshAll}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="form-actions mt">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await recalculateAllPrices()
              return interpolate(t.adminPricing.recalculated, {
                updated: String(r.updated),
                skipped: String(r.skipped),
              })
            })
          }
        >
          {t.adminPricing.recalculateAll}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await setDemoVisibility(false)
              return interpolate(t.adminPricing.demoHidden, { count: String(r.products) })
            })
          }
        >
          {t.adminPricing.demoHide}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await setDemoVisibility(true)
              return interpolate(t.adminPricing.demoShown, { count: String(r.products) })
            })
          }
        >
          {t.adminPricing.demoShow}
        </button>
        {confirmPurge ? (
          <>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await purgeDemoData()
                  rules.reload()
                  return interpolate(t.adminPricing.purged, { products: String(r.products) })
                })
              }
            >
              {t.adminCommon.confirmDelete}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmPurge(false)}>
              {t.common.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline" onClick={() => setConfirmPurge(true)}>
            {t.adminPricing.purgeDemo}
          </button>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="mt">
        {rules.error !== undefined && <Alert tone="error">{getErrorMessage(rules.error, t)}</Alert>}
        {rules.loading && !rules.data ? (
          <Spinner />
        ) : (
          <CrudManager
            title={t.adminPricing.rules}
            rows={rules.data ?? []}
            fields={fields}
            onSave={savePriceRule}
            onDelete={deletePriceRule}
            onChanged={rules.reload}
          />
        )}
      </div>
    </>
  )
}
