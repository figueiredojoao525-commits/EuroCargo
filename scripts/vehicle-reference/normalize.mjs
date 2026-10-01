// EEA commercial names (Mk, Cn) → EuroCargo make → model. Explicit rules only; nothing is guessed.
export const MAKES = [
  ['Renault', 'renault', /^RENAULT$/], ['Ford', 'ford', /^FORD$/], ['Peugeot', 'peugeot', /^PEUGEOT$/],
  ['Volkswagen', 'volkswagen', /^(VOLKSWAGEN|VW)\b|^VOLKSWAGENVW/], ['BMW', 'bmw', /^BMW( I)?$/],
  ['Audi', 'audi', /^AUDI$/], ['Toyota', 'toyota', /^TOYOTA$/], ['Citroën', 'citroen', /^CITROEN$/],
  ['Skoda', 'skoda', /^(SKODA|\?KODA)$/], ['Opel', 'opel', /^(OPEL|VAUXHALL|OPEL VAUXHALL)$/],
  ['Fiat', 'fiat', /^FIAT( - INNOCENTI)?$/], ['Nissan', 'nissan', /^NISSAN$/], ['Kia', 'kia', /^KIA$/],
  ['Hyundai', 'hyundai', /^HYUNDAI$/], ['Dacia', 'dacia', /^DACIA$/],
  ['Mercedes-Benz', 'mercedes-benz', /^MERCEDES(-| )?(BENZ)?$/], ['Seat', 'seat', /^SEAT$/],
  ['Volvo', 'volvo', /^VOLVO$/], ['Suzuki', 'suzuki', /^SUZUKI$/], ['Mini', 'mini', /^MINI$/],
  ['Mazda', 'mazda', /^MAZDA$/], ['Honda', 'honda', /^HONDA$/], ['Mitsubishi', 'mitsubishi', /^MITSUBISHI$/],
  ['Land Rover', 'land-rover', /^LAND ROVER$/], ['Jeep', 'jeep', /^JEEP$/], ['Smart', 'smart', /^SMART$/],
  ['Lancia', 'lancia', /^LANCIA( - AUTOBIANCHI)?$/], ['Porsche', 'porsche', /^PORSCHE$/],
  ['Jaguar', 'jaguar', /^JAGUAR$/], ['Chevrolet', 'chevrolet', /^CHEVROLET$/],
  ['Alfa Romeo', 'alfa-romeo', /^ALFA ROMEO$/], ['Lexus', 'lexus', /^LEXUS$/], ['Tesla', 'tesla', /^TESLA$/],
  ['DS', 'ds', /^DS$/], ['Subaru', 'subaru', /^SUBARU$/], ['Cupra', 'cupra', /^CUPRA$/],
  ['SsangYong', 'ssangyong', /^SSANGYONG$/], ['MG', 'mg', /^MG$/], ['Abarth', 'abarth', /^ABARTH$/],
]

export const clean = (s) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[’'`´]/g, '').replace(/\s+/g, ' ').trim()

export const makeOf = (mk) => MAKES.find(([, , re]) => re.test(clean(mk)))

// Trim / engine / body / marketing tokens: cut from the first one after the model words.
const FOLD = new Set(`S SE SEL SR SRI SXI LS LX EX ES GL GLS GLX GT GTI GTD GTE GTS GTX R RS ST L SE-L
  MATCH EDITION LIMITED ACTIVE ALLURE ACCESS URBAN ICON ICONIC TREND TRENDLINE COMFORTLINE HIGHLINE HIGH MOVE TAKE
  STYLE STYLANCE DYNAMIQUE EXPRESSION INTENS ZEN LIFE BUSINESS EXECUTIVE ELEGANCE PREMIUM LUXURY TITANIUM ZETEC
  TEKNA ACENTA VISIA N-CONNECTA N-TEC SHINE FEEL FLAIR VTR VTR+ VT EXCLUSIVE EXCLUSIV SELECTION COLLECTION CONFORT
  COMFORT TECH TECHNO TECHNIK TECHNOLOGY NAV NAVI MEDIANAV TOMTOM PACK BASE CLASSIC POP LOUNGE EASY X-PLAY
  X-PRESSION X-CITE X-TREND ENERGY ENERGISED EXCITE ELITE DESIGN STING GRIFFIN JAM GLAM TECHLINE LAUREATE AMBIANCE
  PRO PURE BEATS MODA STARTLINE DSTYLE SLINE BLACK ED HSE DYN DYNAMIC EXCEL SPIRIT TAMURA SPORTIUM
  TDI TSI TFSI TFSIE FSI TDCI HDI E-HDI BLUEHDI DCI TCE PURETECH VVT-I VVT CRDI CDI CDTI D I E HYBRID E-HYBRID HEV
  PHEV EV ELECTRIC PLUG-IN PLUG E-TECH BLUEMOTION BMT ECOBOOST ECOFLEX EFLX ECO ECODYNAMICS ISG MULTIJET JTD JTDM
  T-JET THP VTI VTEC I-VTEC I-DTEC SKYACTIV CVT AUTO AT MT S-A S/S MHD BI-FUEL BIFUEL TURBO DIESEL V6 V8 SD4A SDV6
  TD4 DIG-T T8 TWIN 4X4 4MOTION QUATTRO XDRIVE SDRIVE 4MATIC AWD 4WD 2WD 4H
  PORTE PORTES DOORS DOOR HATCHBACK BERLINA BERLINE SALOON SEDAN LIMOUSINE VARIANT ESTATE SW S.W. BREAK
  SPORTOUR SPORTOURER SPORTSTOURER TOURER SPORTBACK AVANT KOMBI CABRIO CABRIOLET COUPE COMBI STATION WAGON
  GRANDTOUR SPORTWAGON NOTCHBACK GTC MAXI BEACH UNLIMITED CITYCARVER OUTDOOR SCOUT SPACEBACK ROADSTER TRAVELLER
  X GRAND KAUAI II III IV V VI VII + ++ R-SPORT R-DESIGN PORTFOLIO ST-LINE ST-2 ST-3 5T STUDIO EDGE VRS FR TOCA
  R-DYN A-BIO SC SP X-PERIENCE MONTE CARLO COLOUR PASSION BOSE PERSONAL OD.RANCH KX-2 GT-LINE CW LM`.split(/\s+/).map((w) => w.replace(/\?$/, '')))
// Second words that make a different model (kept even though the first word is a model on its own).
const DISTINCT = new Set(['PICASSO', 'AIRCROSS', 'CACTUS', 'SPACETOURER', 'SPORTSVAN', 'PLUS', 'CROSS', 'ALLROAD',
  'EVOQUE', 'VELAR', 'CROSSBACK', 'CUSTOM', 'CONNECT', 'COURIER', 'MACH-E', 'XL', 'SCENIC', 'CRUISER', 'CHEROKEE',
  'COUNTRY', 'E-TRON', 'STEPWAY', 'CROSSLAND', 'GRANDLAND', 'SPIDER', 'GRAND_PICASSO', 'TOURER'])
const PREFIX = /^(NEW|NUEVO|NUEVA|NUOVA|NUOVO|NOUVELLE|NOUVEAU|NEUE|NEUER|NIEUWE|NOVO|NOVA|N\.)\s+/
const GLUED = /(SPORTSTOURERSW|SPORTSTOURER|SPORTBACK|AVANT|VARIANT|SW|COUPEMHD|COUPE|ROCKS)$/
const JUNK = new Set(['', 'GRAND', 'SUV', 'NEW', 'NUEVO', 'N', 'N.', 'VAN', 'CAR', 'AUTO', 'M1', 'MODEL', 'UNKNOWN',
  'OTHER', 'R', 'I', 'IX', 'RS', 'DS', 'RANGE', 'LAND', 'ABARTH', 'DISCO-Y', 'X300H', 'AFIRA', 'IBIA', 'TOURNEO', 'Q3 E-TRON'])

// Per make: raw (normalised) key → canonical key, or null to drop.
const RENAME = {
  'volkswagen': { UP: 'UP!', 'MOVE UP': 'UP!', 'HIGH UP': 'UP!', 'TAKE UP': 'UP!', 'GOLF SV': 'GOLF SPORTSVAN', 'PASSAT CC': 'CC', 'KOMBI': 'TRANSPORTER', 'ID3': 'ID.3', 'ID4': 'ID.4' },
  'citroen': { 'C-ELYSSEE': 'C-ELYSEE', 'C4 GR PICASSO': 'C4 GRAND PICASSO', 'JUMPY SPACE': 'JUMPY SPACETOURER', 'JUMPY SPACE TOURER': 'JUMPY SPACETOURER' },
  'fiat': { '500 ABARTH': null, 'FIORINO QUBO': 'FIORINO', '500X CROSS': '500X' },
  'kia': { SPORTAGESLSLS: 'SPORTAGE', CEE: 'CEED', ED: 'CEED', EDCEED: 'CEED', 'ED,CEE': 'CEED', 'PRO CEED': 'PROCEED', SL: 'SPORTAGE' },
  'hyundai': { 'IONIQ5': 'IONIQ 5', 'TUCSONIX35': 'TUCSON', TUCSONIX35LM: 'TUCSON', SANTA: 'SANTA FE' },
  'land-rover': { 'DISCO-Y SPORT': 'DISCOVERY SPORT', 'RROVER SPORT': 'RANGE ROVER SPORT', 'R ROVER': 'RANGE ROVER', 'R ROVER EVOQUE': 'RANGE ROVER EVOQUE', 'R ROVER VELAR': 'RANGE ROVER VELAR', 'R ROVER SPORT': 'RANGE ROVER SPORT' },
  'opel': { 'ASTRA+': 'ASTRA', CROSSLANDX: 'CROSSLAND', MOKKAX: 'MOKKA', GRANDLANDX: 'GRANDLAND', 'CORSA-E': 'CORSA', 'VIVARO-B': 'VIVARO', 'MERIVA-A': 'MERIVA', 'MERIVA-B': 'MERIVA', 'KARLROCKS': 'KARL', VIVAROCKS: 'VIVA', 'VIVARO ZAFIRA': 'ZAFIRA LIFE' },
  'peugeot': { PART: 'PARTNER' },
  'porsche': { '718 BOXSTER': 'BOXSTER', '718 CAYMAN': 'CAYMAN' },
  'renault': { 'CAPTURD-QUE': 'CAPTUR', 'MEGANE SCENIC': 'SCENIC', MEGANESCENIC: 'SCENIC' },
  'seat': { 'CUPRA ATECA': null },
  'skoda': { RAPIDE: 'RAPID' },
  'suzuki': { 'SX4SUZUKI SX4': 'SX4', SX4SUZUKI: 'SX4' },
  'mitsubishi': { SPACE: 'SPACE STAR' },
  'smart': { 'EQ FORTWO': 'FORTWO', 'EQ FORFOUR': 'FORFOUR', FORTWOCOUPEMHD: 'FORTWO', FORTWOCOUPE: 'FORTWO' },
  'toyota': { 'LEXUS NX300H': null, 'AYGO X': 'AYGO' },
  'nissan': { 'QASHQAI +2': 'QASHQAI+2', 'QASHQAI 2': 'QASHQAI+2' },
  'cupra': { 'FORMENTOR VZ': 'FORMENTOR' },
}

function bmw(n) {
  let m
  if ((m = n.match(/^(?:SERIE|SERIES|REIHE)\s?([1-8])\b/) || n.match(/^([1-8])\s?ER\s?REIHE/) || n.match(/^([1-8])\d{2}(?:[A-Z]|\b)/))) {
    return /ACTIVE TOURER/.test(n) ? `Série ${m[1]} Active Tourer` : /GRAN TOURER/.test(n) ? `Série ${m[1]} Gran Tourer` : `Série ${m[1]}`
  }
  if ((m = n.match(/^(X[1-7]|Z4|I3|I4|I8|IX3|IX1|IX)\b/))) return m[1].replace(/^I/, 'i')
  if ((m = n.match(/^M([2-8])\b/))) return `M${m[1]}`
  return null
}
function mercedes(n) {
  let m
  if ((m = n.match(/^(A|B|C|E|S|G|V|X)\s?(?:\d{2,3}|-?KLASSE|CLASS|CLASSE)\b/) || n.match(/^(?:CLASSE|KLASSE|CLASS)\s([ABCEGSVX])\b/)))
    return `Classe ${m[1]}`
  if ((m = n.match(/^(CLA|CLS|CLK|GLA|GLB|GLC|GLE|GLK|GLS|ML|SLK|SLC|SL|EQA|EQB|EQC|EQE|EQS|EQV|CITAN|VITO|VIANO|SPRINTER|MARCO POLO)\b/)))
    return m[1] === 'ML' ? 'Classe M' : m[1]
  return null
}
const mini = (n) => /COUNTRYMAN/.test(n) ? 'COUNTRYMAN' : /CLUBMAN/.test(n) ? 'CLUBMAN' : /PACEMAN/.test(n) ? 'PACEMAN'
  : /^(COOPER|ONE|JOHN COOPER|MINI)\b/.test(n) ? 'COOPER / ONE' : null
const lexus = (n) => { const m = n.match(/^(CT|IS|ES|GS|LS|NX|RX|UX|LC|RC|LBX)\s?\d*/); return m ? m[1] : null }
const porsche = (n) => /^911\b/.test(n) ? '911' : /^TAYCAN\b/.test(n) ? 'TAYCAN' : undefined
const tesla = (n) => { const m = n.match(/^MODEL\s?(S|3|X|Y)\b/); return m ? `MODEL ${m[1]}` : null }

// Raw commercial name → canonical key (upper case, without the make), or null to drop.
export function baseName(slug, cn) {
  let n = clean(cn).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  const mkWord = clean(MAKES.find(([, s]) => s === slug)[0])
  for (const p of [mkWord, mkWord.replace(/[^A-Z0-9]/g, ''), mkWord.split(/[ -]/)[0], 'VW', 'VAUXHALL', 'MERCEDES', 'BENZ', 'SUZUKI']) {
    if (p && (n === p || n.startsWith(p + ' ') || n.startsWith(p) && p.length >= 4)) n = n.slice(p.length).trim()
  }
  n = n.split(/,|\/| OR /)[0].trim().replace(PREFIX, '').trim().replace(/\bGR(AND)? PICASSO\b/, 'GRAND_PICASSO')
  if (slug === 'bmw') return bmw(n)
  if (slug === 'mercedes-benz') return mercedes(n)
  if (slug === 'mini') return mini(n)
  if (slug === 'lexus') return lexus(n)
  if (slug === 'tesla') return tesla(n)
  if (slug === 'porsche' && porsche(n)) return porsche(n)
  if (slug === 'ds') n = n.replace(/^DS\s?(?=\d)/, '')
  if (slug === 'land-rover') n = n.replace(/^(R.? ?ROVER|RROVER)/, 'RANGE ROVER')
  n = n.replace(/^N\s?(?=\d|C\d)/, '')                 // "N208", "N 2008", "NC5": "new" marker
  n = n.replace(/^I (?=\d)/, 'I').replace(/^(I\d{2})\1\w*$/, '$1') // Hyundai "I 30", "I30I30CW"
  let t = n.split(' ')
  if (t.length === 1 && GLUED.test(t[0]) && t[0].replace(GLUED, '').length >= 2) t = [t[0].replace(GLUED, '')]
  // Cut at the first trim / engine / power / number token after the model word(s).
  const isFold = (w) => FOLD.has(w) || /^\d+(\.\d+)?(KW|KWH|CV|PS|HP|V|DR|D|P|T)?$/.test(w) || /^\d\.\d/.test(w)
  const cut = t.findIndex((w, i) => i > 0 && isFold(w) && !(i === 1 && /^\d+$/.test(w) && /^(GRAND|SPACE|C|MODEL)$/.test(t[0])))
  if (cut > 0) t = t.slice(0, cut)
  let out = t.join(' ')
  const r = RENAME[slug]?.[out]
  if (r !== undefined) out = r
  return out === null || JUNK.has(out) ? null : out
}

// Parent-merge: "POLO MATCH" → "POLO" when POLO exists and the extra words are not a distinct model.
export function parentOf(key, keysOfMake, slug) {
  const t = key.split(' ')
  for (let i = t.length - 1; i >= 1; i--) {
    const parent = t.slice(0, i).join(' ')
    if (keysOfMake.has(parent)) {
      const rest = t.slice(i).join(' ')
      if (DISTINCT.has(rest) || DISTINCT.has(t[i]) || slug === 'land-rover' && t[i] === 'SPORT') return null
      return parent
    }
  }
  return null
}

// Display name (EEA is upper case).
const SPECIAL = { GRAND_PICASSO: 'Grand Picasso', 'UP!': 'up!', ION: 'iOn', IQ: 'iQ', 'E-TRON': 'e-tron', MEGANE: 'Mégane', SCENIC: 'Scénic',
  'C-ELYSEE': 'C-Elysée', ZOE: 'Zoe', 'COOPER / ONE': 'Cooper / One', ID: 'ID', XE: 'XE', 'QASHQAI+2': 'Qashqai+2',
  XCEED: 'XCeed', PROCEED: 'ProCeed', 'E-PACE': 'E-Pace', 'F-PACE': 'F-Pace', 'I-PACE': 'I-Pace', 'F-TYPE': 'F-Type' }
const ACRONYMS = new Set(['ASX', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'CLA', 'CLS', 'CLK', 'SLK', 'SLC', 'SL', 'EQA',
  'EQB', 'EQC', 'EQE', 'EQS', 'EQV', 'GT', 'GTC', 'RCZ', 'CC', 'XE', 'XF', 'XJ', 'ZS', 'XV', 'MX', 'CX', 'HR', 'CR',
  'RAV4', 'NV200', 'CT', 'IS', 'ES', 'GS', 'LS', 'NX', 'RX', 'UX', 'LC', 'RC', 'SQ5', 'SQ7', 'RS', 'TT', 'DS3', 'DS4', 'DS5'])
export function display(key, slug) {
  if (/^(Série|Classe) /.test(key) || /^i/.test(key)) return key
  if (SPECIAL[key]) return SPECIAL[key]
  const word = (w) => SPECIAL[w] ?? w.split('-').map((p) => {
    if (SPECIAL[p]) return SPECIAL[p]
    if (/^I\d{2}$|^IX\d{2}$/.test(p) && slug === 'hyundai') return p.toLowerCase()
    if (/\d/.test(p)) return /^[A-Z]{4,}/.test(p) ? p[0] + p.slice(1).toLowerCase() : p
    if (p.length === 1 || ACRONYMS.has(p) || !/[AEIOUY]/.test(p)) return p
    return p[0] + p.slice(1).toLowerCase()
  }).join('-')
  const name = key.split(' ').map(word).join(' ')
  return slug === 'ds' && /^\d/.test(name) ? `DS ${name}` : name
}

export const slugify = (s) => clean(s).toLowerCase().replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
