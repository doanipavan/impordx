import { useState, useRef } from 'react'
import { Plus, Trash2, ShoppingCart, Check, X, BookOpen, Download, Paperclip } from 'lucide-react'
import { useCardItems, useAddCardItem, useUpdateCardItem, useDeleteCardItem, CardItem } from '../../hooks/useCardItems'
import { useCreateCard } from '../../hooks/useCards'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn, formatFileSize } from '../../lib/utils'
import { Card, BoardType } from '../../types'
import { CatalogPicker } from './CatalogPicker'
import { ExportRFQ } from './ExportRFQ'
import { CatalogItem, CATALOG } from '../../lib/catalog'
import { supabase } from '../../lib/supabase'

function CatalogThumbnail({ code }: { code?: string }) {
  const match = code ? CATALOG.find(c => c.code.toLowerCase() === code.toLowerCase()) : null
  return (
    <div className="flex flex-col items-center gap-1">
      {match ? (
        <img src={match.image} alt={match.code} className="h-10 w-10 object-contain rounded border border-border bg-white p-0.5" />
      ) : (
        <div className="h-10 w-10 rounded border border-dashed border-border bg-muted/40 flex items-center justify-center text-[9px] text-muted-foreground">—</div>
      )}
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
  collection: '',
  description: '',
  outside_color: '',
  inside_color: '',
  size: '',
  quantity: 1,
  unit_price_usd: undefined as number | undefined,
  notes: '',
}

type NewItem = typeof EMPTY_ITEM

export function LineItemsTable({ card, readonly }: LineItemsTableProps) {
  const { data: items = [], isLoading } = useCardItems(card.id)
  const addItem = useAddCardItem()
  const updateItem = useUpdateCardItem()
  const deleteItem = useDeleteCardItem()
  const createCard = useCreateCard()
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
  const [generatingOrder, setGeneratingOrder] = useState(false)

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = items.reduce((s, i) => s + (i.quantity * (i.unit_price_usd ?? 0)), 0)

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
        const path = `${card.id}/items/${Date.now()}-${customFile.name}`
        const { error } = await supabase.storage.from('attachments').upload(path, customFile, { contentType: customFile.type })
        if (!error) { file_url = path; file_name = customFile.name }
        setUploadingFile(false)
      }

      await addItem.mutateAsync({
        card_id: card.id,
        ...newItem,
        file_url,
        file_name,
        sort_order: items.length,
      })
      setNewItem({ ...EMPTY_ITEM })
      setAdding(false)
      setCustomFile(null)
      setSelectedCatalogImage(null)
      toast('Item added', 'success')
    } catch {
      toast('Failed to add item', 'error')
    }
  }

  async function handleUpdate(id: string) {
    try {
      await updateItem.mutateAsync({ id, cardId: card.id, ...editValues })
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
      // Create the order card
      const orderCard = await createCard.mutateAsync({
        board: 'orders' as BoardType,
        status: 'Placed',
        title: `Order from: ${card.title}`,
        priority: card.priority,
        client_name: card.client_name,
        collection: card.collection,
        quantity: totalQty,
        value_usd: totalValue > 0 ? totalValue : card.value_usd,
        source_card_id: card.id,
        description: `Generated from ${card.ref_number ?? card.title}\n\nItems:\n${items.map(i =>
          `• ${i.reference_code || ''} ${i.description || ''} — ${i.outside_color || ''} / ${i.inside_color || ''} — ${i.size || ''} — ${i.quantity}pcs${i.unit_price_usd ? ` @ $${i.unit_price_usd}` : ''}`
        ).join('\n')}`,
        reference_code: card.reference_code,
        supplier_ref: card.supplier_ref,
      })

      // Copy items and log
      const { supabase } = await import('../../lib/supabase')
      for (const item of items) {
        const { id: _id, created_at: _c, card_id: _ci, ...rest } = item
        await supabase.from('card_items').insert({ ...rest, card_id: orderCard.id })
      }

      toast('Order card created successfully!', 'success')

      const uid = (await supabase.auth.getUser()).data.user?.id ?? ''
      await supabase.from('activity_logs').insert({
        card_id: card.id, user_id: uid, action: 'generated_order', new_value: orderCard.ref_number ?? orderCard.id.substring(0, 8),
      })
    } catch {
      toast('Failed to generate order', 'error')
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
                {['Internal', 'Description', 'Size', 'Qty', 'Unit $', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className={cn('group hover:bg-muted/30', editingId === item.id && 'bg-blue-50/50')}>
                  {editingId === item.id ? (
                    <>
                      {(['reference_code', 'description', 'size'] as const).map(field => (
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
                        <Input type="number" step="0.01" className="h-6 text-xs px-1"
                          value={String(editValues.unit_price_usd ?? item.unit_price_usd ?? '')}
                          onChange={e => setEditValues(v => ({ ...v, unit_price_usd: e.target.value ? Number(e.target.value) : undefined }))} />
                      </td>
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
                        <CatalogThumbnail code={item.reference_code} />
                      </td>
                      {/* DESCRIPTION */}
                      <td className="px-2 py-1.5 max-w-[160px]">
                        <span className="line-clamp-2">{item.description || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5">{item.size || '—'}</td>
                      <td className="px-2 py-1.5 font-semibold">{item.quantity}</td>
                      <td className="px-2 py-1.5">{item.unit_price_usd ? `$${item.unit_price_usd}` : '—'}</td>
                      <td className="px-2 py-1.5">
                        {!readonly && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingId(item.id); setEditValues({}) }}
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
                  <td colSpan={5} className="px-2 py-1.5 text-right text-muted-foreground text-[10px] uppercase tracking-wide">Total</td>
                  <td className="px-2 py-1.5">{totalQty}</td>
                  <td className="px-2 py-1.5">{totalValue > 0 ? `$${totalValue.toFixed(2)}` : '—'}</td>
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
            <div className="col-span-2"><label className="text-[10px] text-muted-foreground">Description</label>
              <Input className="h-7 text-xs" placeholder="e.g. Parma — Navy Blue" value={newItem.description} onChange={e => setNewItem(v => ({ ...v, description: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div><label className="text-[10px] text-muted-foreground">Size</label>
              <Input className="h-7 text-xs" placeholder="16x16x3.5" value={newItem.size} onChange={e => setNewItem(v => ({ ...v, size: e.target.value }))} />
            </div>
            <div><label className="text-[10px] text-muted-foreground">Qty *</label>
              <Input type="number" className="h-7 text-xs" value={newItem.quantity} onChange={e => setNewItem(v => ({ ...v, quantity: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] text-muted-foreground">Unit Price (USD)</label>
              <Input type="number" step="0.01" className="h-7 text-xs" value={newItem.unit_price_usd ?? ''} onChange={e => setNewItem(v => ({ ...v, unit_price_usd: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="col-span-2"><label className="text-[10px] text-muted-foreground">Notes</label>
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
