// Public columns of the catalogue tables. Since migration 20261004000000 customers (and the
// browser in general) may only read these: internal data — source keys, supplier article codes,
// pricing mode, sync dates, chosen supplier — is not readable (column privileges). Admin pages
// read internal product data through the admin_products view.

export const PRODUCT_COLUMNS =
  'id, sku, name, name_i18n, description, brand_id, category_id, manufacturer, part_number, oe_numbers, ean, ' +
  'group_key, condition, price, currency, availability, stock_quantity, lead_time_days, specs, is_demo, active, ' +
  'created_at, updated_at'

export const IMAGE_COLUMNS = 'id, product_id, url, alt, position, source, license, is_primary, created_at'

export const COMPATIBILITY_COLUMNS =
  'id, product_id, make_id, model_id, variant_id, year_from, year_to, position, notes, verified, created_at'

export const MAKE_COLUMNS = 'id, name, slug, active, created_at, updated_at'

export const MODEL_COLUMNS =
  'id, make_id, name, slug, body_type, year_from, year_to, generation, active, created_at, updated_at'

export const VARIANT_COLUMNS =
  'id, model_id, name, engine_code, fuel, power_kw, power_hp, engine_cc, body_type, year_from, year_to, created_at, updated_at'

/** Product page bundle (product + images + compatibility with vehicle names). */
export const PRODUCT_DETAIL_SELECT = `${PRODUCT_COLUMNS}, brand:brands(name), category:part_categories(id, slug, name, name_i18n),
  product_images(${IMAGE_COLUMNS}),
  product_vehicle_compatibility(${COMPATIBILITY_COLUMNS}, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name))`

export const COMPATIBILITY_WITH_NAMES =
  `${COMPATIBILITY_COLUMNS}, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name)`
