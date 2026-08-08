export interface CatalogItem {
  id: string
  category: string
  code: string
  label: string
  image: string
}

// Estes são os internos (forros) de caixas de joias — não o produto final.
// Cada interno define o tipo de encaixe/forro adequado para o tipo de joia.
export const CATALOG: CatalogItem[] = [
  // ALIANÇA
  { id: 'alianca_r1',  category: 'Aliança', code: 'R1',  label: 'R1',  image: '/catalog/alianca__r1.png' },
  { id: 'alianca_r10', category: 'Aliança', code: 'R10', label: 'R10', image: '/catalog/alianca__r10.png' },
  // ANEL
  { id: 'anel_r1',     category: 'Anel',           code: 'R1',              label: 'R1',              image: '/catalog/anel__r1.png' },
  { id: 'anel_r9',     category: 'Anel',           code: 'R9',              label: 'R9',              image: '/catalog/anel__r9.png' },
  // BRACELETE
  { id: 'brac_w1',     category: 'Bracelete',      code: 'W1',              label: 'W1',              image: '/catalog/bracelete__w1.png' },
  // BRINCO / ARGOLA
  { id: 'brinco_e3',   category: 'Brinco / Argola',code: 'E3',              label: 'E3',              image: '/catalog/brinco_-_argola__e3.png' },
  { id: 'brinco_e20',  category: 'Brinco / Argola',code: 'E20',             label: 'E20',             image: '/catalog/brinco_-_argola__e20.png' },
  { id: 'brinco_e31',  category: 'Brinco / Argola',code: 'E31',             label: 'E31',             image: '/catalog/brinco_-_argola__e31.png' },
  // COLAR
  { id: 'colar_n3',    category: 'Colar',          code: 'N3',              label: 'N3',              image: '/catalog/colar__n3.png' },
  { id: 'colar_p3',    category: 'Colar',          code: 'P3',              label: 'P3',              image: '/catalog/colar__p3.png' },
  { id: 'colar_p5',    category: 'Colar',          code: 'P5',              label: 'P5',              image: '/catalog/colar__p5.png' },
  { id: 'colar_e20',   category: 'Colar',          code: 'E20',             label: 'E20',             image: '/catalog/colar__e20.png' },
  { id: 'colar_n71',   category: 'Colar',          code: 'N71',             label: 'N71 (RDX)',       image: '/catalog/colar__n71_-_rdx_version.png' },
  // CONJUNTO
  { id: 'conj_p67',    category: 'Conjunto',       code: 'P67',             label: 'P67',             image: '/catalog/conjunto__p67.png' },
  { id: 'conj_p71',    category: 'Conjunto',       code: 'P71',             label: 'P71',             image: '/catalog/conjunto__p71.png' },
  { id: 'conj_p71rdx', category: 'Conjunto',       code: 'P71 RDX',         label: 'P71 (RDX)',       image: '/catalog/conjunto__p71_-_rdx_version.png' },
  // PULSEIRA
  { id: 'puls_1',      category: 'Pulseira',       code: 'PULSEIRA-1',      label: 'Pulseira 1',      image: '/catalog/pulseira__pulseira_-_1.png' },
  { id: 'puls_2',      category: 'Pulseira',       code: 'PULSEIRA-2',      label: 'Pulseira 2',      image: '/catalog/pulseira__pulseira_-_2.png' },
]

export const CATALOG_CATEGORIES = [...new Set(CATALOG.map(i => i.category))]
