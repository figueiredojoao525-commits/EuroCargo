// Canonical import fields and the column names (PT / ES / EN / FR / DE / IT and common
// feed names) recognised automatically. The admin can always change the mapping.

export const IMPORT_FIELDS = [
  // Identification
  'external_id',
  'sku',
  'reference',
  'oe_numbers',
  'ean',
  'cross_references',
  // Description
  'name',
  'description',
  'brand',
  'manufacturer',
  'category',
  'condition',
  // Commercial (public price, availability)
  'price',
  'currency',
  'stock',
  'availability',
  'lead_time_days',
  'active',
  // Supplier (internal only)
  'supplier',
  'supplier_reference',
  'cost',
  'cost_currency',
  'supplier_url',
  // Images
  'images',
  'image_alt',
  'image_license',
  // Vehicle (one per row, or a structured "vehicles" list)
  'vehicles',
  'vehicle_make',
  'vehicle_model',
  'vehicle_generation',
  'vehicle_variant',
  'vehicle_engine_code',
  'vehicle_fuel',
  'vehicle_engine_cc',
  'vehicle_power_kw',
  'vehicle_power_hp',
  'vehicle_year_from',
  'vehicle_year_to',
  'vehicle_years',
  'vehicle_position',
  // Origin
  'source_updated_at',
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

/**
 * Fields that may come from several columns: values are combined in column order
 * (category: "Família > Subfamília"; lists: merged).
 */
export const MULTI_COLUMN_FIELDS: ReadonlySet<ImportField> = new Set([
  'category',
  'images',
  'oe_numbers',
  'cross_references',
])

/** Groups for the mapping UI. */
export const FIELD_GROUPS: { key: string; fields: ImportField[] }[] = [
  { key: 'identification', fields: ['external_id', 'sku', 'reference', 'oe_numbers', 'ean', 'cross_references'] },
  { key: 'description', fields: ['name', 'description', 'brand', 'manufacturer', 'category', 'condition'] },
  { key: 'commercial', fields: ['price', 'currency', 'stock', 'availability', 'lead_time_days', 'active'] },
  { key: 'supplier', fields: ['supplier', 'supplier_reference', 'cost', 'cost_currency', 'supplier_url'] },
  { key: 'images', fields: ['images', 'image_alt', 'image_license'] },
  {
    key: 'vehicle',
    fields: [
      'vehicles',
      'vehicle_make',
      'vehicle_model',
      'vehicle_generation',
      'vehicle_variant',
      'vehicle_engine_code',
      'vehicle_fuel',
      'vehicle_engine_cc',
      'vehicle_power_kw',
      'vehicle_power_hp',
      'vehicle_year_from',
      'vehicle_year_to',
      'vehicle_years',
      'vehicle_position',
    ],
  },
  { key: 'origin', fields: ['source_updated_at'] },
]

/** Accent-free, lower-case, words joined by "_": "Referência OE" → "referencia_oe". */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const ALIASES: Record<ImportField, string[]> = {
  external_id: ['external_id', 'id_externo', 'source_id', 'article_id', 'artikel_id', 'articleid', 'id_artigo', 'id_articulo', 'item_id', 'product_id', 'id', 'codigo', 'cod', 'codigo_artigo', 'cod_artigo', 'codigo_articulo', 'artigo', 'articulo', 'item_code', 'article_code'],
  sku: ['sku', 'codigo_interno', 'internal_code', 'our_sku', 'sku_eurocargo'],
  reference: ['reference', 'referencia', 'ref', 'part_number', 'partnumber', 'part_no', 'numero_peca', 'numero_pieza', 'artikelnummer', 'article_number', 'articlenumber', 'mpn', 'codigo_fabricante', 'riferimento', 'reference_fabricant', 'manufacturer_reference'],
  oe_numbers: ['oe', 'oem', 'oe_numbers', 'oe_number', 'oe_numbers_list', 'referencia_oe', 'referencias_oe', 'numero_oe', 'oe_nummer', 'oe_nummern', 'original_number', 'numero_original', 'riferimento_oe', 'reference_origine'],
  ean: ['ean', 'ean13', 'gtin', 'barcode', 'codigo_barras', 'codigo_de_barras'],
  cross_references: ['cross_references', 'cross_reference', 'referencias_cruzadas', 'equivalencias', 'equivalentes', 'vergleichsnummern'],
  name: ['name', 'nome', 'nombre', 'designacao', 'designacion', 'descricao_curta', 'title', 'titulo', 'product_name', 'article_name', 'bezeichnung', 'denominazione', 'designation', 'libelle'],
  description: ['description', 'descricao', 'descripcion', 'beschreibung', 'descrizione', 'long_description', 'observacoes'],
  brand: ['brand', 'marca', 'marca_peca', 'marque', 'marke', 'hersteller_marke', 'brand_name', 'supplier_brand'],
  manufacturer: ['manufacturer', 'fabricante', 'fabricant', 'hersteller', 'produttore'],
  category: ['category', 'categoria', 'categorie', 'kategorie', 'familia', 'family', 'grupo', 'group', 'product_group', 'warengruppe', 'subfamilia', 'subfamily', 'subcategoria', 'subcategory', 'subgrupo'],
  condition: ['condition', 'condicao', 'estado', 'condicion', 'etat', 'zustand', 'condizione', 'new_used', 'novo_usado'],
  price: ['price', 'preco', 'precio', 'pvp', 'prix', 'preis', 'prezzo', 'retail_price', 'public_price', 'preco_publico', 'precio_venta', 'sale_price'],
  currency: ['currency', 'moeda', 'moneda', 'devise', 'wahrung', 'valuta'],
  stock: ['stock', 'quantidade', 'cantidad', 'qty', 'quantity', 'stock_qty', 'existencias', 'bestand', 'quantite', 'quantita', 'inventory'],
  availability: ['availability', 'disponibilidade', 'disponibilidad', 'disponibilite', 'verfugbarkeit', 'disponibilita', 'stock_status', 'estado_stock'],
  lead_time_days: ['lead_time_days', 'lead_time', 'prazo', 'prazo_entrega', 'plazo', 'plazo_entrega', 'delivery_days', 'dias_entrega', 'lieferzeit', 'delai'],
  active: ['active', 'ativo', 'activo', 'enabled', 'publicado', 'published', 'visible'],
  supplier: ['supplier', 'fornecedor', 'proveedor', 'fournisseur', 'lieferant', 'fornitore', 'vendor'],
  supplier_reference: ['supplier_reference', 'supplier_sku', 'referencia_fornecedor', 'ref_fornecedor', 'referencia_proveedor', 'vendor_sku', 'supplier_code'],
  cost: ['cost', 'custo', 'coste', 'costo', 'cost_price', 'preco_custo', 'precio_coste', 'purchase_price', 'net_price', 'preco_compra', 'einkaufspreis', 'prix_achat'],
  cost_currency: ['cost_currency', 'moeda_custo', 'moneda_coste'],
  supplier_url: ['supplier_url', 'url', 'link', 'product_url', 'url_fornecedor', 'source_url'],
  images: ['images', 'image', 'imagens', 'imagem', 'imagenes', 'imagen', 'image_url', 'image_urls', 'photo', 'photos', 'foto', 'fotos', 'bilder', 'bild', 'immagini', 'picture', 'pictures'],
  image_alt: ['image_alt', 'alt', 'alt_text', 'texto_alternativo'],
  image_license: ['image_license', 'license', 'licenca', 'licencia', 'licenca_imagem', 'image_rights', 'copyright'],
  vehicles: ['vehicles', 'veiculos', 'vehiculos', 'fahrzeuge', 'compatibility', 'compatibilidade', 'compatibilidad', 'applications', 'aplicacoes', 'aplicaciones'],
  vehicle_make: ['vehicle_make', 'make', 'marca_veiculo', 'marca_vehiculo', 'car_make', 'car_brand', 'fahrzeughersteller', 'marca_auto'],
  vehicle_model: ['vehicle_model', 'model', 'modelo', 'modele', 'modell', 'modello', 'car_model'],
  vehicle_generation: ['vehicle_generation', 'generation', 'geracao', 'generacion', 'serie', 'series', 'baureihe'],
  vehicle_variant: ['vehicle_variant', 'variant', 'versao', 'version', 'motorizacao', 'motorizacion', 'engine'],
  vehicle_engine_code: ['vehicle_engine_code', 'engine_code', 'codigo_motor', 'motorcode', 'motorkennbuchstabe', 'code_moteur'],
  vehicle_fuel: ['vehicle_fuel', 'fuel', 'combustivel', 'combustible', 'kraftstoff', 'carburant', 'alimentazione'],
  vehicle_engine_cc: ['vehicle_engine_cc', 'engine_cc', 'cc', 'cilindrada', 'hubraum', 'cylindree', 'displacement', 'ccm'],
  vehicle_power_kw: ['vehicle_power_kw', 'power_kw', 'kw', 'potencia_kw', 'leistung_kw'],
  vehicle_power_hp: ['vehicle_power_hp', 'power_hp', 'hp', 'cv', 'ps', 'potencia_cv', 'ch'],
  vehicle_year_from: ['vehicle_year_from', 'year_from', 'ano_de', 'ano_inicio', 'ano_inicial', 'desde', 'from_year', 'baujahr_von', 'anno_da'],
  vehicle_year_to: ['vehicle_year_to', 'year_to', 'ano_ate', 'ano_fim', 'ano_final', 'hasta', 'to_year', 'baujahr_bis', 'anno_a'],
  vehicle_years: ['vehicle_years', 'years', 'anos', 'anios', 'baujahr', 'periodo', 'year_range'],
  vehicle_position: ['vehicle_position', 'position', 'posicao', 'posicion', 'einbauseite', 'lado', 'side', 'fitting_position'],
  source_updated_at: ['source_updated_at', 'updated_at', 'last_update', 'ultima_atualizacao', 'ultima_actualizacion', 'modified', 'date_modified'],
}

const LOOKUP = new Map<string, ImportField>()
for (const field of IMPORT_FIELDS) for (const alias of ALIASES[field]) if (!LOOKUP.has(alias)) LOOKUP.set(alias, field)

/** Field a column name maps to automatically, or null. */
export function guessField(header: string): ImportField | null {
  const key = normalizeHeader(header)
  // "Imagem 1", "OE_2", "foto3" → numbered copies of the same field.
  const base = key.replace(/_?\d+$/, '')
  return (
    LOOKUP.get(key) ??
    LOOKUP.get(base) ??
    LOOKUP.get(key.split('_').pop() ?? '') ??
    LOOKUP.get(base.split('_').pop() ?? '') ??
    null
  )
}

/** Keys used inside structured vehicle / image objects ("marca", "modelo", "ano_de"...). */
export function vehicleKey(key: string): string | null {
  const field = guessField(key)
  if (!field) return null
  if (field.startsWith('vehicle_')) return field.slice('vehicle_'.length)
  // Inside a vehicle object, "brand"/"marca" is the vehicle make and "name" the variant.
  if (field === 'brand' || field === 'manufacturer') return 'make'
  return null
}

export function imageKey(key: string): 'url' | 'alt' | 'license' | 'source' | 'is_primary' | null {
  const k = normalizeHeader(key)
  if (['url', 'src', 'href', 'link', 'image', 'image_url', 'imagem', 'imagen'].includes(k)) return 'url'
  if (['alt', 'alt_text', 'title', 'texto_alternativo'].includes(k)) return 'alt'
  if (['license', 'licenca', 'licencia', 'copyright', 'rights'].includes(k)) return 'license'
  if (['source', 'origem', 'origen', 'credit', 'credito'].includes(k)) return 'source'
  if (['primary', 'is_primary', 'main', 'principal'].includes(k)) return 'is_primary'
  return null
}
