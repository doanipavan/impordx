export interface CatalogItem {
  id: string
  category: string
  code: string
  label: string
  image: string
  description?: string
}

export const CATALOG: CatalogItem[] = [
  // BRINCO - ARGOLA
  { id: 'brinco_e3',  category: 'Brinco / Argola', code: 'E3',  label: 'E3',  image: '/catalog/brinco_-_argola__e3.png' },
  { id: 'brinco_e20', category: 'Brinco / Argola', code: 'E20', label: 'E20', image: '/catalog/brinco_-_argola__e20.png' },
  { id: 'brinco_e31', category: 'Brinco / Argola', code: 'E31', label: 'E31', image: '/catalog/brinco_-_argola__e31.png' },
  // COLAR
  { id: 'colar_n3',   category: 'Colar',            code: 'N3',  label: 'N3',  image: '/catalog/colar__n3.png' },
  { id: 'colar_p3',   category: 'Colar',            code: 'P3',  label: 'P3',  image: '/catalog/colar__p3.png' },
  { id: 'colar_p5',   category: 'Colar',            code: 'P5',  label: 'P5',  image: '/catalog/colar__p5.png' },
  { id: 'colar_e20',  category: 'Colar',            code: 'E20', label: 'E20', image: '/catalog/colar__e20.png' },
  { id: 'colar_n71',  category: 'Colar',            code: 'N71', label: 'N71 (RDX)', image: '/catalog/colar__n71_-_rdx_version.png' },
]

export const CATALOG_CATEGORIES = [...new Set(CATALOG.map(i => i.category))]
