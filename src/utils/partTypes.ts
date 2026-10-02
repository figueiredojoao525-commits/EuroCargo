/**
 * Part types used to pick an illustrative photo for a product that has no photo of its own.
 * A type is recognised from the category slug and words of the Portuguese product name
 * (the catalogue's canonical name). Order matters: the first match wins.
 *
 * `search` is the English term used to look for freely licensed photos (scripts/images).
 */
export interface PartType {
  key: string
  category: string
  /** Matched against the accent-free, lower-case product name. */
  match: RegExp
  search: string
  /** Closest other type whose photo to use while this one has none (before any photo of the category). */
  similar?: string
}

export const PART_TYPES: PartType[] = [
  // travagem
  { key: 'brake-pads', category: 'travagem', match: /pastilha/, search: 'brake pads' },
  { key: 'brake-disc', category: 'travagem', match: /disco/, search: 'brake disc rotor' },
  { key: 'brake-caliper', category: 'travagem', match: /pinca/, search: 'brake caliper' },
  // filtros
  { key: 'oil-filter', category: 'filtros', match: /filtro de oleo/, search: 'oil filter' },
  { key: 'cabin-filter', category: 'filtros', match: /habitaculo|polen/, search: 'cabin air filter' },
  { key: 'fuel-filter', category: 'filtros', match: /combustivel|gasoleo/, search: 'fuel filter' },
  { key: 'air-filter', category: 'filtros', match: /filtro de ar/, search: 'air filter element' },
  // iluminacao
  { key: 'headlight', category: 'iluminacao', match: /farol(?!im)|otica/, search: 'car headlight' },
  { key: 'tail-light', category: 'iluminacao', match: /farolim/, search: 'car tail light' },
  { key: 'bulb', category: 'iluminacao', match: /lampada/, search: 'halogen headlight bulb' },
  // suspensao
  { key: 'shock-absorber', category: 'suspensao', match: /amortecedor/, search: 'shock absorber car part' },
  { key: 'stabilizer-link', category: 'suspensao', match: /bieleta/, search: 'anti-roll bar link' },
  { key: 'control-arm', category: 'suspensao', match: /braco/, search: 'wishbone suspension' },
  { key: 'coil-spring', category: 'suspensao', match: /mola/, search: 'coil spring suspension' },
  // direcao
  { key: 'power-steering-pump', category: 'direcao', match: /bomba/, search: 'power steering pump car' },
  { key: 'ball-joint', category: 'direcao', match: /rotula/, search: 'ball joint automotive' },
  { key: 'tie-rod-end', category: 'direcao', match: /terminal/, search: 'tie rod end' },
  // transmissao
  { key: 'cv-joint', category: 'transmissao', match: /homocinetica/, search: 'constant velocity joint' },
  { key: 'wheel-bearing', category: 'transmissao', match: /rolamento/, search: 'wheel hub bearing' },
  { key: 'drive-shaft', category: 'transmissao', match: /semieixo/, search: 'CV axle' },
  // motor
  { key: 'water-pump', category: 'motor', match: /bomba de agua/, search: 'water pump automobile' },
  { key: 'accessory-belt', category: 'motor', match: /correia de acessorios/, search: 'V-ribbed belt' },
  { key: 'valve-cover-gasket', category: 'motor', match: /junta/, search: 'cylinder head cover gasket' },
  { key: 'timing-kit', category: 'motor', match: /distribuicao/, search: 'timing belt' },
  // refrigeracao
  { key: 'thermostat', category: 'refrigeracao', match: /termostato/, search: 'engine thermostat' },
  { key: 'radiator-fan', category: 'refrigeracao', match: /ventilador/, search: 'radiator cooling fan' },
  { key: 'radiator', category: 'refrigeracao', match: /radiador/, search: 'radiator automobile cooling', similar: 'radiator-fan' },
  // eletrico
  { key: 'alternator', category: 'eletrico', match: /alternador/, search: 'alternator' },
  { key: 'starter-motor', category: 'eletrico', match: /arranque/, search: 'starter motor' },
  { key: 'battery', category: 'eletrico', match: /bateria/, search: 'car battery' },
  { key: 'abs-sensor', category: 'eletrico', match: /abs/, search: 'ABS sensor' },
  // embraiagem
  { key: 'clutch-kit', category: 'embraiagem', match: /kit de embraiagem/, search: 'clutch disc' },
  { key: 'clutch-bearing', category: 'embraiagem', match: /rolamento/, search: 'clutch release bearing' },
  { key: 'flywheel', category: 'embraiagem', match: /volante/, search: 'dual mass flywheel' },
  // escape
  { key: 'muffler', category: 'escape', match: /silenciador/, search: 'car muffler' },
  { key: 'lambda-sensor', category: 'escape', match: /lambda/, search: 'oxygen sensor lambda' },
  // ar-condicionado
  { key: 'ac-compressor', category: 'ar-condicionado', match: /compressor/, search: 'Klimakompressor' },
  { key: 'ac-condenser', category: 'ar-condicionado', match: /condensador/, search: 'Klimakondensator', similar: 'ac-compressor' },
  // carrocaria
  { key: 'wiper-blades', category: 'carrocaria', match: /escova|limpa/, search: 'wiper blade' },
  { key: 'bumper-grille', category: 'carrocaria', match: /grelha/, search: 'radiator grille' },
  { key: 'bumper', category: 'carrocaria', match: /para-choques/, search: 'car bumper' },
  { key: 'side-mirror', category: 'carrocaria', match: /retrovisor/, search: 'car side mirror' },
  // acessorios
  { key: 'roof-bars', category: 'acessorios', match: /tejadilho/, search: 'roof rack bars car' },
  { key: 'floor-mats', category: 'acessorios', match: /tapete/, search: 'car floor mats' },
  { key: 'first-aid-kit', category: 'acessorios', match: /socorros/, search: 'first aid kit' },
  { key: 'warning-triangle', category: 'acessorios', match: /triangulo/, search: 'warning triangle' },
  // consumiveis
  { key: 'coolant', category: 'consumiveis', match: /refrigeracao/, search: 'antifreeze coolant' },
  { key: 'brake-fluid', category: 'consumiveis', match: /travoes/, search: 'brake fluid' },
  { key: 'washer-fluid', category: 'consumiveis', match: /limpa-vidros/, search: 'windshield washer fluid' },
  { key: 'engine-oil', category: 'consumiveis', match: /oleo/, search: 'motor oil' },
]

function plain(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** The part type of a product, or null when no rule recognises it. */
export function partTypeOf(categorySlug: string | null | undefined, name: string): PartType | null {
  if (!categorySlug) return null
  const text = plain(name)
  return PART_TYPES.find((type) => type.category === categorySlug && type.match.test(text)) ?? null
}
