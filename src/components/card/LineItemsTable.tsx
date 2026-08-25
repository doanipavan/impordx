import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, ShoppingCart, Check, X, BookOpen, Download, Paperclip } from 'lucide-react'
import { useCardItems, useAddCardItem, useUpdateCardItem, useDeleteCardItem, CardItem } from '../../hooks/useCardItems'
import { usePromoteToOrder } from '../../hooks/useCards'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn, formatFileSize, COLLECTION_SIZES } from '../../lib/utils'
import { Card, BoardType } from '../../types'
import { CatalogPicker } from './CatalogPicker'
import { ExportRFQ } from './ExportRFQ'
import { CatalogItem, CATALOG } from '../../lib/catalog'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getSignedUrl } from '../../hooks/useAttachments'

const isImageName = (name?: string) => /\.(jpe?g|png|webp|gif)$/i.test(name ?? '')

// The uploaded file wins over the catalogue picture: it is the reference for
// this specific line, while the catalogue image is only the generic insert.
function ItemThumbnail({ code, fileName, signedUrl, onOpen }: {
  code?: string
  fileName?: string
  signedUrl?: string
  onOpen?: () => void
}) {
  const catalogue = code ? CATALOG.find(c => c.code.toLowerCase() === code.toLowerCase()) : null
  const hasUpload = !!fileName

  let visual
  if (hasUpload && isImageName(fileName) && signedUrl) {
    // contain, never cover: these are technical drawings, and cropping one
    // silently removes the annotation that made it worth attaching.
    visual = <img src={signedUrl} alt={fileName} title={fileName}
      className="h-10 w-10 object-contain bg-white rounded border border-primary/40 p-0.5" />
  } else if (hasUpload) {
    // A PDF has no preview here, but it must still be visibly attached.
    visual = (
      <div title={fileName}
        className="h-10 w-10 rounded border border-primary/40 bg-primary/5 flex items-center justify-center">
        <span className="text-[8px] font-bold text-primary">PDF</span>
      </div>
    )
  } else if (catalogue) {
    visual = <img src={catalogue.image} alt={catalogue.code}
      className="h-10 w-10 object-contain rounded border border-border bg-white p-0.5" />
  } else {
    visual = <div className="h-10 w-10 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-[9px] text-muted-foreground">—</div>
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {hasUpload && onOpen
        ? <button type="button" onClick={onOpen} title={`Open ${fileName}`}>{visual}</button>
        : visual}
      <span className="font-mono text-[10px] font-semibold">{code || '—'}</span>
    </div>
  )
}

interface LineItemsTableProps {
  card: Card
  readonly?: boolean
}

const EMPTY_ITEM = {
  reference_code: '',
  erp_code: '',
  collection: '',
  description: '',
  outside_color: '',
  inside_color: '',
  size: '',
  quantity: 1,
  // Kept as typed, parsed only on save. Holding it as a number meant "1.190"
  // round-tripped to 1.19 mid-keystroke and ate the zero you were typing.
  unit_price_input: '',
  sale_price_input: '',
  notes: '',
}

type NewItem = typeof EMPTY_ITEM

// DEQI quotes to three decimals, and types the comma a Brazilian keyboard gives.
function parsePrice(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.')
  if (!text) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

function formatPrice(value: number | null | undefined): string {
  return value == null ? '—' : `$${value.toFixed(3)}`
}

// Kept to two places: a sale price is quoted in centavos, not in tenths of one.
function formatBrl(value: number | null | undefined): string {
  return value == null ? '—' : `R$ ${value.toFixed(2).replace('.', ',')}`
}

export function LineItemsTable({ card, readonly }: LineItemsTableProps) {
  const { user } = useAuth()
  // The sale price is the sell side of the margin. DEQI must never see it —
  // hidden here, though the row itself is still readable through the API.
  const showSale = user?.role !== 'viewer'

  const { data: items = [], isLoading } = useCardItems(card.id)
  const addItem = useAddCardItem()
  const updateItem = useUpdateCardItem()
  const deleteItem = useDeleteCardItem()
  const promoteToOrder = usePromoteToOrder()
  const toast = useToast()

  const [adding, setAdding] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [selectedCatalogImage, setSelectedCatalogImage] = useState<string | null>(null)
  const [customFile, setCustomFile] = useState<File | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [newItem, setNewItem] = useState<NewItem>({ ...EMPTY_ITEM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<CardItem>>({})
  const [editPrice, setEditPrice] = useState('')
  const [editSale, setEditSale] = useState('')
  const [generatingOrder, setGeneratingOrder] = useState(false)
  const [customSize, setCustomSize] = useState(false)

  // Item files live in private storage, so each needs its own signed URL
  // before it can be shown. The ref stops re-signing on every render.
  const [itemUrls, setItemUrls] = useState<Record<string, string>>({})
  const signed = useRef<Set<string>>(new Set())

  useEffect(() => {
    const pending = items.filter(i => i.file_url && !signed.current.has(i.id))
    if (pending.length === 0) return
    pending.forEach(i => signed.current.add(i.id))

    let cancelled = false
    Promise.all(pending.map(async i => {
      try { return [i.id, await getSignedUrl(i.file_url!)] as const }
      catch { return null }  // a missing file just falls back to the icon
    })).then(entries => {
      if (cancelled) return
      const ok = entries.filter((e): e is readonly [string, string] => e !== null)
      if (ok.length) setItemUrls(prev => ({ ...prev, ...Object.fromEntries(ok) }))
    })
    return () => { cancelled = true }
  }, [items])

  // The card's collection decides whether Size is a fixed list or free text.
  const sizeOptions = card.collection ? COLLECTION_SIZES[card.collection] ?? null : null

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0)
  const totalSale = items.reduce((s, i) => s + (i.quantity * (i.sale_price_brl ?? 0)), 0)

  function handleCatalogSelect(item: CatalogItem | null) {
    setShowCatalog(false)
    setAdding(true)
    if (item) {
      setNewItem(v => ({
        ...v,
        reference_code: item.code,
        description: item.label + ' — ' + item.category,
      }))
      setSelectedCatalogImage(item.image)
    } else {
      setNewItem({ ...EMPTY_ITEM })
      setSelectedCatalogImage(null)
    }
  }

  async function handleAdd() {
    if (!newItem.reference_code && !newItem.description) {
      toast('Enter at least a reference or description', 'error')
      return
    }
    try {
      let file_url: string | undefined
      let file_name: string | undefined

      if (customFile) {
        setUploadingFile(true)
        // Keep the original name in file_name only — the storage key is derived
        // so spaces and accents in the filename can't break the upload.
        const ext = customFile.name.split('.').pop()
        const path = `${card.id}/items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('attachments').upload(path, customFile, { contentType: customFile.type })
        setUploadingFile(false)
        if (error) {
          console.error('Item file upload failed:', error)
          toast('Could not upload the file — item not added', 'error')
          return
        }
        file_url = path
        file_name = customFile.name
      }

      const { unit_price_input, sale_price_input, ...fields } = newItem
      await addItem.mutateAsync({
        card_id: card.id,
        ...fields,
        unit_price_usd: parsePrice(unit_price_input),
        sale_price_brl: parsePrice(sale_price_input),
        file_url,
        file_name,
        sort_order: items.length,
      })
      setNewItem({ ...EMPTY_ITEM })
      setAdding(false)
      setCustomFile(null)
      setSelectedCatalogImage(null)
      toast('Item added', 'success')
    } catch (err) {
      // Swallowing this is why a missing column looked like a generic failure.
      console.error('Failed to add item:', err)
      setUploadingFile(false)
      toast('Failed to add item', 'error')
    }
  }

  async function handleUpdate(id: string) {
    try {
      await updateItem.mutateAsync({ id, cardId: card.id, ...editValues,
        unit_price_usd: parsePrice(editPrice), sale_price_brl: parsePrice(editSale) })
      setEditingId(null)
    } catch {
      toast('Failed to update item', 'error')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteItem.mutateAsync({ id, cardId: card.id })
    } catch {
      toast('Failed to delete item', 'error')
    }
  }

  async function handleGenerateOrder() {
    if (items.length === 0) { toast('Add at least one item first', 'error'); return }
    setGeneratingOrder(true)
    try {
      const order = await promoteToOrder.mutateAsync({ id: card.id, fromBoard: card.board as BoardType })
      toast(`Moved to Orders as ${order.ref_number ?? 'a new order'}`, 'success')
    } catch (err) {
      console.error('Failed to move card to Orders:', err)
      toast('Failed to move to Orders', 'error')
    } finally {
      setGeneratingOrder(false)
    }
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading items...</p>

  const canGenerateOrder = (card.board === 'samples' && card.status === 'Approved') ||
    (card.board === 'quotes' && card.status === 'Confirmed')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Product Line Items {items.length > 0 && `(${items.length})`}
        </p>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowExport(true)}>
              <Download className="h-3.5 w-3.5" />
              Export RFQ
            </Button>
          )}
          {canGenerateOrder && (
            <Button size="sm" onClick={handleGenerateOrder} loading={generatingOrder} className="gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" />
              Generate Order
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {items.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                {['Internal', 'ERP (DEV)', 'Description', 'Size', 'Qty', 'Unit $',
                  ...(showSale ? ['Sale R$'] : []), ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className={cn('group hover:bg-muted/30', editingId === item.id && 'bg-blue-50/50')}>
                  {editingId === item.id ? (
                    <>
                      {(['reference_code', 'erp_code', 'description', 'size'] as const).map(field => (
                        <td key={field} className="px-1 py-1">
                          <Input className="h-6 text-xs px-1" value={String(editValues[field] ?? item[field] ?? '')}
                            onChange={e => setEditValues(v => ({ ...v, [field]: e.target.value }))} />
                        </td>
                      ))}
                      <td className="px-1 py-1 w-12">
                        <Input type="number" className="h-6 text-xs px-1" value={editValues.quantity ?? item.quantity}
                          onChange={e => setEditValues(v => ({ ...v, quantity: Number(e.target.value) }))} />
                      </td>
                      <td className="px-1 py-1 w-16">
                        <Input type="text" inputMode="decimal" className="h-6 text-xs px-1"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)} />
                      </td>
                      {showSale && (
                        <td className="px-1 py-1 w-16">
                          <Input type="text" inputMode="decimal" className="h-6 text-xs px-1"
                            value={editSale}
                            onChange={e => setEditSale(e.target.value)} />
                        </td>
                      )}
                      <td className="px-1 py-1">
                        <div className="flex gap-1">
                          <button onClick={() => handleUpdate(item.id)} className="p-0.5 text-green-600 hover:bg-green-50 rounded"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-0.5 text-muted-foreground hover:bg-muted rounded"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* INTERNAL — code + catalog thumbnail */}
                      <td className="px-2 py-1.5 w-24">
                        <ItemThumbnail
                          code={item.reference_code}
                          fileName={item.file_name}
                          signedUrl={itemUrls[item.id]}
                          onOpen={item.file_url ? () => window.open(itemUrls[item.id], '_blank') : undefined}
                        />
                      </td>
                      {/* ERP code in DEV */}
                      <td className="px-2 py-1.5">
                        {item.erp_code
                          ? <span className="font-mono text-[11px]">{item.erp_code}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* DESCRIPTION */}
                      <td className="px-2 py-1.5 max-w-[160px]">
                        <span className="line-clamp-2">{item.description || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5">{item.size || '—'}</td>
                      <td className="px-2 py-1.5 font-semibold">{item.quantity}</td>
                      <td className="px-2 py-1.5">{formatPrice(item.unit_price_usd)}</td>
                      {showSale && (
                        <td className={cn('px-2 py-1.5',
                          item.sale_price_brl == null && 'text-muted-foreground')}>
                          {formatBrl(item.sale_price_brl)}
                        </td>
                      )}
                      <td className="px-2 py-1.5">
                        {!readonly && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingId(item.id); setEditValues({}); setEditPrice(item.unit_price_usd != null ? String(item.unit_price_usd) : '');
                              setEditSale(item.sale_price_brl != null ? String(item.sale_price_brl) : '') }}
                              className="p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={() => handleDelete(item.id)}
                              className="p-0.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}

              {/* Totals */}
              {items.length > 1 && (
                <tr className="bg-muted/40 font-semibold">
                  <td colSpan={4} className="px-2 py-1.5 text-right text-muted-foreground text-[10px] uppercase tracking-wide">Total</td>
                  <td className="px-2 py-1.5">{totalQty}</td>
                  <td className="px-2 py-1.5">{totalValue > 0 ? `$${totalValue.toFixed(2)}` : '—'}</td>
                  {showSale && (
                    <td className="px-2 py-1.5">
                      {totalSale > 0 ? `R$ ${totalSale.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                  )}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add row */}
      {!readonly && !adding && (
        <button onClick={() => setShowCatalog(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
          <BookOpen className="h-3.5 w-3.5" /> Browse catalog / Add item
        </button>
      )}

      {showCatalog && <CatalogPicker onSelect={handleCatalogSelect} onClose={() => setShowCatalog(false)} />}

      {adding && (
        <div className="border border-dashed border-border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-center gap-3 mb-1">
            {selectedCatalogImage ? (
              <img src={selectedCatalogImage} alt="" className="h-12 w-12 object-contain rounded-lg border border-border bg-white p-1 shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center shrink-0 text-muted-foreground">
                <Plus className="h-5 w-5" />
              </div>
            )}
            <div>
              <p className="text-xs font-medium">{selectedCatalogImage ? 'Catalog item selected' : 'Custom item'}</p>
              <button type="button" className="text-[10px] text-primary hover:underline" onClick={() => setShowCatalog(true)}>
                {selectedCatalogImage ? 'Change product' : 'Browse catalog'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] text-muted-foreground">Reference</label>
              <Input className="h-7 text-xs" value={newItem.reference_code} onChange={e => setNewItem(v => ({ ...v, reference_code: e.target.value }))} />
            </div>
            <div><label className="text-[10px] text-muted-foreground">ERP (DEV)</label>
              <Input className="h-7 text-xs font-mono" placeholder="code in DEV" value={newItem.erp_code} onChange={e => setNewItem(v => ({ ...v, erp_code: e.target.value }))} />
            </div>
            <div><label className="text-[10px] text-muted-foreground">Description</label>
              <Input className="h-7 text-xs" placeholder="e.g. Parma — Navy Blue" value={newItem.description} onChange={e => setNewItem(v => ({ ...v, description: e.target.value }))} />
            </div>
          </div>
          {sizeOptions && !customSize ? (
            <div>
              <label className="text-[10px] text-muted-foreground">
                Size <span className="text-muted-foreground/70">· {card.collection}</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {sizeOptions.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setNewItem(v => ({ ...v, size }))}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors tabular-nums',
                      newItem.size === size
                        ? 'bg-primary text-primary-foreground border-primary font-semibold'
                        : 'bg-muted/50 border-border hover:bg-accent'
                    )}
                  >
                    {size}
                  </button>
                ))}
                {/* A closed table would trap you the day a new measurement shows up. */}
                <button type="button"
                  onClick={() => { setCustomSize(true); setNewItem(v => ({ ...v, size: '' })) }}
                  className="text-xs px-2.5 py-1 rounded-full border border-border bg-card text-muted-foreground italic hover:bg-accent transition-colors">
                  Other…
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-2"><label className="text-[10px] text-muted-foreground">Size</label>
                <Input className="h-7 text-xs" placeholder="16 x 16 x 3,5 cm" value={newItem.size} onChange={e => setNewItem(v => ({ ...v, size: e.target.value }))} autoFocus={customSize} />
              </div>
              {sizeOptions && (
                <div className="flex items-end">
                  <button type="button" onClick={() => { setCustomSize(false); setNewItem(v => ({ ...v, size: '' })) }}
                    className="h-7 text-xs px-2 rounded text-muted-foreground hover:bg-accent transition-colors">
                    ← list
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <div><label className="text-[10px] text-muted-foreground">Qty *</label>
              <Input type="number" className="h-7 text-xs" value={newItem.quantity} onChange={e => setNewItem(v => ({ ...v, quantity: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] text-muted-foreground">Unit price (USD)</label>
              <Input type="text" inputMode="decimal" placeholder="1.195" className="h-7 text-xs"
                value={newItem.unit_price_input}
                onChange={e => setNewItem(v => ({ ...v, unit_price_input: e.target.value }))} />
            </div>
            {showSale && (
              <div><label className="text-[10px] text-muted-foreground">Sale price (BRL)</label>
                <Input type="text" inputMode="decimal" placeholder="12,90" className="h-7 text-xs"
                  value={newItem.sale_price_input}
                  onChange={e => setNewItem(v => ({ ...v, sale_price_input: e.target.value }))} />
              </div>
            )}
            <div className={showSale ? '' : 'col-span-2'}><label className="text-[10px] text-muted-foreground">Notes</label>
              <Input className="h-7 text-xs" value={newItem.notes} onChange={e => setNewItem(v => ({ ...v, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} loading={addItem.isPending || uploadingFile}>
              {uploadingFile ? 'Uploading...' : 'Add item'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewItem({ ...EMPTY_ITEM }); setSelectedCatalogImage(null); setCustomFile(null) }}>Cancel</Button>
          </div>

          {/* File upload for custom items only */}
          {!selectedCatalogImage && (
            <div className="border-t border-border pt-2">
              {customFile ? (
                <div className="flex items-center gap-2 bg-muted rounded px-2 py-1.5 text-xs">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{customFile.name}</span>
                  <span className="text-muted-foreground">{formatFileSize(customFile.size)}</span>
                  <button onClick={() => setCustomFile(null)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">
                  <Paperclip className="h-3.5 w-3.5" /> Attach reference image or PDF
                </button>
              )}
              <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf"
                onChange={e => setCustomFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>
      )}

      {!canGenerateOrder && items.length > 0 && card.board === 'samples' && (
        <p className="text-[10px] text-muted-foreground">
          "Generate Order" will appear when this sample reaches <strong>Approved</strong> status.
        </p>
      )}

      {showCatalog && <CatalogPicker onSelect={handleCatalogSelect} onClose={() => setShowCatalog(false)} />}
      {showExport && <ExportRFQ card={card} items={items} onClose={() => setShowExport(false)} />}
    </div>
  )
}
