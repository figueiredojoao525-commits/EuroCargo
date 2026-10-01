import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { EMPTY_VEHICLE } from '../../components/shop/vehicle'
import { VehicleLookup } from '../../components/shop/VehicleLookup'
import { VehicleSelector } from '../../components/shop/VehicleSelector'
import { useAsync } from '../../hooks/useAsync'
import { useI18n } from '../../i18n/context'
import { catalogProvider } from '../../services/catalog'
import { formatYears } from '../../utils/catalog'

/** /veiculos — choose the vehicle first, then browse compatible parts. */
export function VehiclesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [vehicle, setVehicle] = useState(EMPTY_VEHICLE)
  const makes = useAsync(() => catalogProvider.listMakes(), [])
  const models = useAsync(() => catalogProvider.listModels(), [])

  function showParts() {
    const params = new URLSearchParams()
    if (vehicle.makeId) params.set('make', vehicle.makeId)
    if (vehicle.modelId) params.set('model', vehicle.modelId)
    if (vehicle.variantId) params.set('variant', vehicle.variantId)
    if (vehicle.year) params.set('year', vehicle.year)
    navigate(`/pecas?${params.toString()}`)
  }

  return (
    <div className="container page">
      <header className="shop-header">
        <p className="eyebrow-pill">{t.vehicles.eyebrow}</p>
        <h1>{t.vehicles.title}</h1>
        <p className="muted">{t.vehicles.subtitle}</p>
      </header>

      <section className="card vehicle-finder">
        <VehicleSelector value={vehicle} onChange={setVehicle} idPrefix="finder" />
        <button type="button" className="btn btn-accent btn-lg" disabled={!vehicle.makeId} onClick={showParts}>
          {t.vehicles.showParts}
          <Icon name="arrowRight" size={18} />
        </button>
        <VehicleLookup />
      </section>

      <h2 className="mt">{t.vehicles.browse}</h2>
      {makes.loading && !makes.data && <Spinner />}
      <div className="make-grid">
        {makes.data?.map((make) => (
          <section key={make.id} className="card make-card">
            <h3>{make.name}</h3>
            <ul>
              {models.data
                ?.filter((model) => model.make_id === make.id)
                .map((model) => (
                  <li key={model.id}>
                    <Link to={`/pecas?make=${make.id}&model=${model.id}`}>
                      {model.name}
                      {(model.year_from || model.year_to) && (
                        <span className="muted"> · {formatYears(model.year_from, model.year_to)}</span>
                      )}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
