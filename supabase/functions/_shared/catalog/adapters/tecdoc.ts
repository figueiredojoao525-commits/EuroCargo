// TecDoc (TecAlliance) adapter — PREPARED, NOT IMPLEMENTED.
//
// TecDoc data may only be used under a TecAlliance licence, and the web-service API,
// endpoints and authentication are provided with that contract. Until then this adapter
// exposes no capabilities, so nothing is ever called.
//
// To implement (once the contract and credentials exist):
//   1. supabase secrets set CATALOG_PROVIDER=tecdoc CATALOG_API_URL=<endpoint> CATALOG_API_KEY=<key>
//      (provider id / language / country go in catalog_sources.config for the "tecdoc" source:
//       e.g. {"provider_id": 12345, "lang": "pt", "country": "PT"} — never the key).
//   2. Implement the methods below, mapping TecDoc articles to ImportRow:
//        article number → reference, brand (dataSupplier) → brand, generic article → category,
//        OE numbers → oe_numbers, EAN → ean, linked vehicles (linkage targets) → vehicles
//        [make, model, generation, variant, engine_code, fuel, engine_cc, power_kw, power_hp,
//        year_from, year_to, verified: true], images → images (with the licence text),
//        `price` left empty (TecDoc is not a price source).
//   3. Return the real capabilities (search, reference, oe, vehicle, vin*, images, compatibility).
//      *VIN only if the contract includes the VIN lookup service.
//   4. Enable the "tecdoc" source in Admin → Catálogo → Providers (mode "live" and/or "import").
import { AdapterNotImplementedError, type AdapterConfig, type CatalogAdapter } from '../types.ts'

export function createTecDocAdapter(_config: AdapterConfig): CatalogAdapter {
  return {
    name: 'tecdoc',
    capabilities: [],
    search() {
      return Promise.reject(new AdapterNotImplementedError('tecdoc', 'search'))
    },
  }
}
