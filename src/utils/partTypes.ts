/**
 * Part types used to pick an illustrative photo for a product that has no photo of its own.
 * A type is recognised from the category slug and words of the Portuguese product name
 * (the catalogue's canonical name). Order matters: the first match wins.
 *
 * `search` (English) and `terms` (pt/es/fr/de) are used to look for freely licensed photos (scripts/images).
 */
export interface PartType {
  key: string
  category: string
  /** Matched against the accent-free, lower-case product name. */
  match: RegExp
  search: string
  /** Same search in the other languages of the shop (Commons has many captions in pt/es/fr/de). */
  terms?: Partial<Record<'pt' | 'es' | 'fr' | 'de', string>>
  /** Closest other type whose photo to use while this one has none (before any photo of the category). */
  similar?: string
}

export const PART_TYPES: PartType[] = [
  // travagem
  { key: 'brake-pads', category: 'travagem', match: /pastilha/, search: 'brake pads', terms: { pt: 'pastilhas de travão', es: 'pastillas de freno', fr: 'plaquettes de frein', de: 'Bremsbeläge' } },
  { key: 'brake-disc', category: 'travagem', match: /disco/, search: 'brake disc rotor', terms: { pt: 'disco de travão', es: 'disco de freno', fr: 'disque de frein', de: 'Bremsscheibe' } },
  { key: 'brake-caliper', category: 'travagem', match: /pinca/, search: 'brake caliper', terms: { pt: 'pinça de travão', es: 'pinza de freno', fr: 'étrier de frein', de: 'Bremssattel' } },
  // filtros
  { key: 'oil-filter', category: 'filtros', match: /filtro de oleo/, search: 'oil filter', terms: { pt: 'filtro de óleo', es: 'filtro de aceite', fr: 'filtre à huile', de: 'Ölfilter' } },
  { key: 'cabin-filter', category: 'filtros', match: /habitaculo|polen/, search: 'cabin air filter', terms: { pt: 'filtro de habitáculo', es: 'filtro de habitáculo', fr: 'filtre d\'habitacle', de: 'Innenraumfilter' } },
  { key: 'fuel-filter', category: 'filtros', match: /combustivel|gasoleo/, search: 'fuel filter', terms: { pt: 'filtro de combustível', es: 'filtro de combustible', fr: 'filtre à carburant', de: 'Kraftstofffilter' } },
  { key: 'air-filter', category: 'filtros', match: /filtro de ar/, search: 'air filter element', terms: { pt: 'filtro de ar automóvel', es: 'filtro de aire coche', fr: 'filtre à air voiture', de: 'Luftfilter Auto' } },
  // iluminacao
  { key: 'headlight', category: 'iluminacao', match: /farol(?!im)|otica/, search: 'car headlight', terms: { pt: 'farol automóvel', es: 'faro delantero coche', fr: 'phare automobile', de: 'Scheinwerfer Auto' } },
  { key: 'tail-light', category: 'iluminacao', match: /farolim/, search: 'car tail light', terms: { pt: 'farolim traseiro', es: 'piloto trasero coche', fr: 'feu arrière voiture', de: 'Rückleuchte' } },
  { key: 'bulb', category: 'iluminacao', match: /lampada/, search: 'halogen headlight bulb', terms: { pt: 'lâmpada halogénea automóvel', es: 'bombilla halógena coche', fr: 'ampoule halogène voiture', de: 'Halogenlampe Auto' } },
  // suspensao
  { key: 'shock-absorber', category: 'suspensao', match: /amortecedor/, search: 'shock absorber car part', terms: { pt: 'amortecedor automóvel', es: 'amortiguador coche', fr: 'amortisseur voiture', de: 'Stoßdämpfer Auto' } },
  { key: 'stabilizer-link', category: 'suspensao', match: /bieleta/, search: 'anti-roll bar link', terms: { pt: 'bieleta barra estabilizadora', es: 'bieleta estabilizadora', fr: 'biellette de barre stabilisatrice', de: 'Koppelstange' } },
  { key: 'control-arm', category: 'suspensao', match: /braco/, search: 'wishbone suspension', terms: { pt: 'braço de suspensão', es: 'brazo de suspensión', fr: 'triangle de suspension', de: 'Querlenker' } },
  { key: 'coil-spring', category: 'suspensao', match: /mola/, search: 'coil spring suspension', terms: { pt: 'mola de suspensão', es: 'muelle de suspensión', fr: 'ressort de suspension', de: 'Schraubenfeder Fahrwerk' } },
  // direcao
  { key: 'power-steering-pump', category: 'direcao', match: /bomba/, search: 'power steering pump car', terms: { pt: 'bomba de direção assistida', es: 'bomba de dirección asistida', fr: 'pompe de direction assistée', de: 'Servopumpe' } },
  { key: 'ball-joint', category: 'direcao', match: /rotula/, search: 'ball joint automotive', terms: { pt: 'rótula de suspensão', es: 'rótula de suspensión', fr: 'rotule de suspension', de: 'Traggelenk' } },
  { key: 'tie-rod-end', category: 'direcao', match: /terminal/, search: 'tie rod end', terms: { pt: 'terminal de direção', es: 'rótula de dirección', fr: 'rotule de direction', de: 'Spurstangenkopf' } },
  // transmissao
  { key: 'cv-joint', category: 'transmissao', match: /homocinetica/, search: 'constant velocity joint', terms: { pt: 'junta homocinética', es: 'junta homocinética', fr: 'joint homocinétique', de: 'Gleichlaufgelenk' } },
  { key: 'wheel-bearing', category: 'transmissao', match: /rolamento/, search: 'wheel hub bearing', terms: { pt: 'rolamento de roda', es: 'rodamiento de rueda', fr: 'roulement de roue', de: 'Radlager' } },
  { key: 'drive-shaft', category: 'transmissao', match: /semieixo/, search: 'CV axle', terms: { pt: 'semieixo de transmissão', es: 'palier transmisión', fr: 'cardan de transmission', de: 'Antriebswelle' } },
  // motor
  { key: 'water-pump', category: 'motor', match: /bomba de agua/, search: 'water pump automobile', terms: { pt: 'bomba de água motor', es: 'bomba de agua motor', fr: 'pompe à eau moteur', de: 'Wasserpumpe Motor' } },
  { key: 'accessory-belt', category: 'motor', match: /correia de acessorios/, search: 'V-ribbed belt', terms: { pt: 'correia de acessórios', es: 'correa poli-V', fr: 'courroie d\'accessoires', de: 'Keilrippenriemen' } },
  { key: 'valve-cover-gasket', category: 'motor', match: /junta/, search: 'cylinder head cover gasket', terms: { pt: 'junta da tampa das válvulas', es: 'junta tapa de balancines', fr: 'joint de cache-culbuteurs', de: 'Ventildeckeldichtung' } },
  { key: 'timing-kit', category: 'motor', match: /distribuicao/, search: 'timing belt', terms: { pt: 'correia de distribuição', es: 'correa de distribución', fr: 'courroie de distribution', de: 'Zahnriemen' } },
  // refrigeracao
  { key: 'thermostat', category: 'refrigeracao', match: /termostato/, search: 'engine thermostat', terms: { pt: 'termóstato motor', es: 'termostato motor', fr: 'thermostat moteur', de: 'Thermostat Kühlsystem' } },
  { key: 'radiator-fan', category: 'refrigeracao', match: /ventilador/, search: 'radiator cooling fan', terms: { pt: 'ventilador do radiador', es: 'electroventilador', fr: 'ventilateur de radiateur', de: 'Kühlerlüfter' } },
  { key: 'radiator', category: 'refrigeracao', match: /radiador/, search: 'radiator automobile cooling', terms: { pt: 'radiador do motor', es: 'radiador coche', fr: 'radiateur moteur', de: 'Kühler Auto' }, similar: 'radiator-fan' },
  // eletrico
  { key: 'alternator', category: 'eletrico', match: /alternador/, search: 'alternator', terms: { pt: 'alternador', es: 'alternador coche', fr: 'alternateur', de: 'Lichtmaschine' } },
  { key: 'starter-motor', category: 'eletrico', match: /arranque/, search: 'starter motor', terms: { pt: 'motor de arranque', es: 'motor de arranque', fr: 'démarreur', de: 'Anlasser' } },
  { key: 'battery', category: 'eletrico', match: /bateria/, search: 'car battery', terms: { pt: 'bateria automóvel', es: 'batería coche', fr: 'batterie voiture', de: 'Autobatterie' } },
  { key: 'abs-sensor', category: 'eletrico', match: /abs/, search: 'ABS sensor', terms: { pt: 'sensor ABS', es: 'sensor ABS', fr: 'capteur ABS', de: 'ABS-Sensor' } },
  // embraiagem
  { key: 'clutch-kit', category: 'embraiagem', match: /kit de embraiagem/, search: 'clutch disc', terms: { pt: 'kit de embraiagem', es: 'kit de embrague', fr: 'kit d\'embrayage', de: 'Kupplungssatz' } },
  { key: 'clutch-bearing', category: 'embraiagem', match: /rolamento/, search: 'clutch release bearing', terms: { pt: 'rolamento de embraiagem', es: 'cojinete de embrague', fr: 'butée d\'embrayage', de: 'Ausrücklager' } },
  { key: 'flywheel', category: 'embraiagem', match: /volante/, search: 'dual mass flywheel', terms: { pt: 'volante bimassa', es: 'volante bimasa', fr: 'volant moteur bimasse', de: 'Zweimassenschwungrad' } },
  // escape
  { key: 'muffler', category: 'escape', match: /silenciador/, search: 'car muffler', terms: { pt: 'silenciador de escape', es: 'silenciador escape', fr: 'silencieux d\'échappement', de: 'Auspufftopf' } },
  { key: 'lambda-sensor', category: 'escape', match: /lambda/, search: 'oxygen sensor lambda', terms: { pt: 'sonda lambda', es: 'sonda lambda', fr: 'sonde lambda', de: 'Lambdasonde' } },
  // ar-condicionado
  { key: 'ac-compressor', category: 'ar-condicionado', match: /compressor/, search: 'Klimakompressor', terms: { pt: 'compressor de ar condicionado', es: 'compresor aire acondicionado', fr: 'compresseur de climatisation', de: 'Klimakompressor' } },
  { key: 'ac-condenser', category: 'ar-condicionado', match: /condensador/, search: 'Klimakondensator', terms: { pt: 'condensador ar condicionado', es: 'condensador aire acondicionado', fr: 'condenseur de climatisation', de: 'Klimakondensator' }, similar: 'ac-compressor' },
  // carrocaria
  { key: 'wiper-blades', category: 'carrocaria', match: /escova|limpa/, search: 'wiper blade', terms: { pt: 'escovas limpa-vidros', es: 'escobillas limpiaparabrisas', fr: 'balais d\'essuie-glace', de: 'Scheibenwischer' } },
  { key: 'bumper-grille', category: 'carrocaria', match: /grelha/, search: 'radiator grille', terms: { pt: 'grelha do para-choques', es: 'rejilla parachoques', fr: 'grille de pare-chocs', de: 'Kühlergrill' } },
  { key: 'bumper', category: 'carrocaria', match: /para-choques/, search: 'car bumper', terms: { pt: 'para-choques', es: 'parachoques', fr: 'pare-chocs', de: 'Stoßstange' } },
  { key: 'side-mirror', category: 'carrocaria', match: /retrovisor/, search: 'car side mirror', terms: { pt: 'retrovisor exterior', es: 'retrovisor exterior', fr: 'rétroviseur extérieur', de: 'Außenspiegel' } },
  // acessorios
  { key: 'roof-bars', category: 'acessorios', match: /tejadilho/, search: 'roof rack bars car', terms: { pt: 'barras de tejadilho', es: 'barras de techo', fr: 'barres de toit', de: 'Dachträger' } },
  { key: 'floor-mats', category: 'acessorios', match: /tapete/, search: 'car floor mats', terms: { pt: 'tapetes de borracha automóvel', es: 'alfombrillas de goma coche', fr: 'tapis de sol voiture', de: 'Gummifußmatten' } },
  { key: 'first-aid-kit', category: 'acessorios', match: /socorros/, search: 'first aid kit', terms: { pt: 'kit de primeiros socorros', es: 'botiquín coche', fr: 'trousse de secours', de: 'Verbandkasten' } },
  { key: 'warning-triangle', category: 'acessorios', match: /triangulo/, search: 'warning triangle', terms: { pt: 'triângulo de sinalização', es: 'triángulo de emergencia', fr: 'triangle de signalisation', de: 'Warndreieck' } },
  // consumiveis
  { key: 'coolant', category: 'consumiveis', match: /refrigeracao/, search: 'antifreeze coolant', terms: { pt: 'líquido de refrigeração', es: 'anticongelante coche', fr: 'liquide de refroidissement', de: 'Kühlerfrostschutz' } },
  { key: 'brake-fluid', category: 'consumiveis', match: /travoes/, search: 'brake fluid', terms: { pt: 'líquido de travões', es: 'líquido de frenos', fr: 'liquide de frein', de: 'Bremsflüssigkeit' } },
  { key: 'washer-fluid', category: 'consumiveis', match: /limpa-vidros/, search: 'windshield washer fluid', terms: { pt: 'líquido limpa-vidros', es: 'líquido limpiaparabrisas', fr: 'lave-glace', de: 'Scheibenwaschwasser' } },
  { key: 'engine-oil', category: 'consumiveis', match: /oleo/, search: 'motor oil', terms: { pt: 'óleo de motor', es: 'aceite de motor', fr: 'huile moteur', de: 'Motoröl' } },
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
