import { useState } from 'react'
import { X, Search, Plus, Package } from 'lucide-react'
import { CATALOG, CATALOG_CATEGORIES, CatalogItem } from '../../lib/catalog'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

interface CatalogPickerProps {
  onSelect: (item: CatalogItem | null) => void
  onClose: () => void
}

export function CatalogPicker({ onSelect, onClose }: CatalogPickerProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [preview, setPreview] = useState<CatalogItem | null>(null)

  const filtered = CATALOG.filter(item => {
    const matchCat = category === 'all' || item.category === category
    const matchSearch = !search || item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-card rounded-xl shadow-modal border border-border flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold">Box Internal Catalog</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Select the box internal (lining type) for this jewelry piece</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search + Filters */}
        <div className="px-5 py-3 border-b border-border shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search by code or category..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setCategory('all')}
              className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', category === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              All
            </button>
            {CATALOG_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors', category === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {/* Custom option */}
            <button
              onClick={() => onSelect(null)}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="h-16 w-full flex items-center justify-center text-muted-foreground group-hover:text-primary">
                <Plus className="h-8 w-8" />
              </div>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-primary">Custom</span>
            </button>

            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setPreview(item)}
                className={cn(
                  'flex flex-col items-center gap-2 p-2 rounded-lg border-2 transition-all hover:shadow-card-hover',
                  preview?.id === item.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                )}
              >
                <div className="h-16 w-full rounded-md overflow-hidden bg-slate-50 flex items-center justify-center">
                  <img src={item.image} alt={item.label} className="h-full w-full object-contain p-1" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold">{item.code}</p>
                  <p className="text-[10px] text-muted-foreground">{item.category}</p>
                </div>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-4 text-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No products found</p>
              </div>
            )}
          </div>
        </div>

        {/* Preview / Confirm */}
        {preview && (
          <div className="border-t border-border px-5 py-4 flex items-center gap-4 shrink-0 bg-muted/30">
            <img src={preview.image} alt={preview.label} className="h-14 w-14 object-contain rounded-lg border border-border bg-white p-1" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{preview.label}</p>
              <p className="text-xs text-muted-foreground">{preview.category}</p>
            </div>
            <Button onClick={() => onSelect(preview)}>
              Select this product
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
