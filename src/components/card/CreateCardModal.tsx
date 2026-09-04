import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Paperclip, X, File, Image as ImageIcon } from 'lucide-react'
import { BoardType, CardStatus, BOARD_COLUMNS, BOARD_LABELS, Priority } from '../../types'
import { useCreateCard } from '../../hooks/useCards'
import { useUploadAttachment } from '../../hooks/useAttachments'
import { useRedantexUsers } from '../../hooks/useUsers'
import { useToast } from '../ui/toast'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/select'
import { Label } from '../ui/label'
import { collectionsFor, LOGO_TECHNIQUES, OUTSIDE_MATERIALS, INSIDE_MATERIALS, formatFileSize, mergeMaterialCodes } from '../../lib/utils'
import { useSupplierFilter, useSuppliers } from '../../hooks/useSupplierFilter'

const schema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  salesperson_id: z.string().optional(),
  salesperson_name: z.string().optional(),
  project_manager_id: z.string().min(1, 'Pick who runs it'),
  status: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent'] as const),
  client_name: z.string().optional(),
  supplier_id: z.string().optional(),
  collection: z.string().optional(),
  quantity: z.union([z.number().positive(), z.nan(), z.literal('')]).optional(),
  deadline: z.string().optional(),
  description: z.string().optional(),
  outside_material: z.string().optional(),
  outside_material_code: z.string().optional(),
  inside_material: z.string().optional(),
  inside_material_code: z.string().optional(),
  logo_color: z.string().optional(),
  logo_technique_outside: z.string().optional(),
  logo_technique_inside: z.string().optional(),
  logo_text_outside: z.string().optional(),
  logo_text_inside: z.string().optional(),
  logo_color_outside: z.string().optional(),
  logo_color_inside: z.string().optional(),
  reference_code: z.string().optional(),
  supplier_ref: z.string().optional(),
})

// Either a linked account or a typed name — the field is required, the
// shape it takes is not.
.refine(v => (v.salesperson_id?.trim() || v.salesperson_name?.trim()),
  { message: 'Name the salesperson', path: ['salesperson_id'] })

type FormValues = z.infer<typeof schema>

interface CreateCardModalProps {
  board: BoardType
  initialStatus: CardStatus
  onClose: () => void
}

const ACCEPTED = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
]
// 50 MB é o teto do bucket, e vale para qualquer tipo — um número menor aqui
// só recusaria vídeo que o servidor aceitaria.
const MAX_FILE_SIZE = 50 * 1024 * 1024

export function CreateCardModal({ board, initialStatus, onClose }: CreateCardModalProps) {
  const createCard = useCreateCard()
  const uploadAttachment = useUploadAttachment()
  const { data: staff = [] } = useRedantexUsers()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Who is making this piece. It decides which catalogue the collection list
  // offers, which clock the delivery date will run on, and — in the database —
  // which supplier account can see the card at all. So it is picked here rather
  // than inherited silently.
  const [supplierFilter] = useSupplierFilter()
  const { data: suppliers = [] } = useSuppliers()

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: initialStatus, priority: 'medium' },
  })

  // Picking a listed account hides the free-text box, so only one is ever sent.
  const watchedSalesperson = watch('salesperson_id')

  const chosenSupplierId = watch('supplier_id')
  const chosenSupplier = suppliers.find(s => s.id === chosenSupplierId)?.short_name
  const collections = collectionsFor(chosenSupplier)

  // The list arrives after the first render, so the default is set once it does:
  // whichever supplier the board is scoped to, and DEQI when it is scoped to
  // all — which is what the database defaults the row to anyway (migration 032).
  useEffect(() => {
    if (chosenSupplierId || suppliers.length === 0) return
    const preferred =
      suppliers.find(s => s.id === supplierFilter) ??
      suppliers.find(s => s.short_name === 'DEQI') ??
      suppliers[0]
    if (preferred) setValue('supplier_id', preferred.id)
  }, [suppliers, supplierFilter, chosenSupplierId, setValue])

  // Changing supplier changes the catalogue, so a collection that belonged to
  // the old one has to go rather than be submitted against the new supplier.
  const chosenCollection = watch('collection')
  useEffect(() => {
    if (chosenCollection && !collections.includes(chosenCollection)) {
      setValue('collection', '')
    }
  }, [collections, chosenCollection, setValue])

  function addFiles(files: File[]) {
    const supported = files.filter(f => ACCEPTED.includes(f.type))
    const unsupported = files.filter(f => !ACCEPTED.includes(f.type))
    if (unsupported.length) {
      toast(`Not supported: ${unsupported.map(f => f.name).join(', ')} — JPG, PNG, WEBP, PDF, MP4 or MOV only`, 'error')
    }
    const tooBig = supported.filter(f => f.size > MAX_FILE_SIZE)
    if (tooBig.length) {
      toast(`Too large: ${tooBig.map(f => f.name).join(', ')} — 50 MB max`, 'error')
    }
    setQueuedFiles(prev => [...prev, ...supported.filter(f => f.size <= MAX_FILE_SIZE)])
  }

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      const finalDescription = mergeMaterialCodes(values.description,
        values.outside_material_code, values.inside_material_code)

      const card = await createCard.mutateAsync({
        board,
        status: values.status as CardStatus,
        title: values.title,
        priority: values.priority as Priority,
        salesperson_id: values.salesperson_id || undefined,
        salesperson_name: values.salesperson_id ? undefined : (values.salesperson_name?.trim() || undefined),
        project_manager_id: values.project_manager_id,
        client_name: values.client_name || undefined,
        supplier_id: values.supplier_id || undefined,
        collection: values.collection || undefined,
        quantity: values.quantity ? Number(values.quantity) : undefined,
        deadline: values.deadline || undefined,
        description: finalDescription || undefined,
        outside_material: values.outside_material || undefined,
        inside_material: values.inside_material || undefined,
        logo_color: values.logo_color || undefined,
        logo_technique_outside: values.logo_technique_outside || undefined,
        logo_technique_inside: values.logo_technique_inside || undefined,
        logo_text_outside: values.logo_text_outside || undefined,
        logo_text_inside: values.logo_text_inside || undefined,
        logo_color_outside: values.logo_color_outside || undefined,
        logo_color_inside: values.logo_color_inside || undefined,
        reference_code: values.reference_code || undefined,
        supplier_ref: values.supplier_ref || undefined,
      })

      for (const file of queuedFiles) {
        try {
          await uploadAttachment.mutateAsync({ cardId: card.id, file })
        } catch (err) {
          // The card is already saved at this point, so the upload failing is
          // recoverable — but only if it says why.
          console.error(`Upload failed for ${file.name}:`, err)
          const detail = (err as { message?: string })?.message
          toast(detail ? `"${file.name}": ${detail}` : `Failed to upload "${file.name}"`, 'error')
        }
      }

      toast(`Card created${queuedFiles.length > 0 ? ` with ${queuedFiles.length} file(s)` : ''}`, 'success')
      onClose()
    } catch (err) {
      // The database says why it refused; showing "please try again" instead
      // just moves the diagnosis off the screen and into a debugging session.
      console.error('Failed to create card:', err)
      const detail = (err as { message?: string })?.message
      toast(detail ? `Failed to create card: ${detail}` : 'Failed to create card. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = BOARD_COLUMNS[board]

  return (
    <Dialog open onClose={onClose} size="lg" title="New Card">
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogHeader onClose={onClose}>
          New {BOARD_LABELS[board].replace(/s$/, '')} Card
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input id="title" placeholder="e.g. Parma 300pcs Navy Blue — Quote Request" {...register('title')} autoFocus />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
          </div>

          {/* Owners — required, so a card can never arrive without one. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="salesperson_id">Salesperson *</Label>
              <Select id="salesperson_id" {...register('salesperson_id')}>
                <option value="">— Someone else —</option>
                {staff.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
              {/* Reps and outside sales have no account, so the name can just
                  be typed when they are not in the list. */}
              {!watchedSalesperson && (
                <Input className="mt-1.5" placeholder="Type the salesperson's name"
                  {...register('salesperson_name')} />
              )}
              {errors.salesperson_id && <p className="text-xs text-destructive mt-1">{errors.salesperson_id.message}</p>}
            </div>
            <div>
              <Label htmlFor="project_manager_id">Project manager *</Label>
              <Select id="project_manager_id" {...register('project_manager_id')}>
                <option value="">— Select —</option>
                {staff.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
              {errors.project_manager_id && <p className="text-xs text-destructive mt-1">{errors.project_manager_id.message}</p>}
            </div>
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">Initial Status</Label>
              <Select id="status" {...register('status')}>
                {columns.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" {...register('priority')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
          </div>

          {/* Supplier + Client + Collection. Supplier sits immediately left of
              the catalogue it governs, so the dependency is visible. */}
          <div className={suppliers.length > 1 ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}>
            {/* Redantex only. A supplier account has one supplier and nothing
                to choose between, and must not learn that another exists. */}
            {suppliers.length > 1 && (
              <div>
                <Label htmlFor="supplier_id">Supplier</Label>
                <Select id="supplier_id" {...register('supplier_id')}>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.short_name}</option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="client_name">Client Name</Label>
              <Input id="client_name" placeholder="e.g. Lize Joias" {...register('client_name')} />
            </div>
            <div>
              <Label htmlFor="collection">Collection</Label>
              <Select id="collection" {...register('collection')}>
                <option value="">— Select —</option>
                {collections.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          {/* Quantity + Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" placeholder="300" {...register('quantity', { valueAsNumber: true })} />
            </div>
            <div>
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="date" {...register('deadline')} />
            </div>
          </div>

          {/* Materials — same row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Outside Material</Label>
              <Select id="outside_material" {...register('outside_material')}>
                <option value="">— Select —</option>
                {OUTSIDE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Input placeholder="Material # (e.g. V-023)" {...register('outside_material_code')} />
            </div>
            <div className="space-y-1.5">
              <Label>Inside Material</Label>
              <Select id="inside_material" {...register('inside_material')}>
                <option value="">— Select —</option>
                {INSIDE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Input placeholder="Material # (e.g. P-118)" {...register('inside_material_code')} />
            </div>
          </div>

          {/* Logo */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Logo</Label>
            <div className="rounded-lg border border-border p-3 space-y-3">
              {/* Outside */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Outside</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Technique</Label>
                    <Select {...register('logo_technique_outside')}>
                      <option value="">— Select —</option>
                      {LOGO_TECHNIQUES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Text / Brand</Label>
                    <Input placeholder="e.g. Redantex" {...register('logo_text_outside')} />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input placeholder="e.g. Gold" {...register('logo_color_outside')} />
                  </div>
                </div>
              </div>
              <div className="h-px bg-border" />
              {/* Inside */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Inside</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Technique</Label>
                    <Select {...register('logo_technique_inside')}>
                      <option value="">— Select —</option>
                      {LOGO_TECHNIQUES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Text / Brand</Label>
                    <Input placeholder="e.g. Redantex" {...register('logo_text_inside')} />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input placeholder="e.g. Silver" {...register('logo_color_inside')} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* References */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="reference_code">Reference Code (RDX)</Label>
              <Input id="reference_code" placeholder="500578" {...register('reference_code')} />
            </div>
            <div>
              <Label htmlFor="supplier_ref">Supplier Ref (DEQI)</Label>
              <Input id="supplier_ref" {...register('supplier_ref')} />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description / Notes</Label>
            <Textarea id="description" placeholder="Additional details, special instructions, color references..." rows={3} {...register('description')} />
          </div>

          {/* File upload */}
          <div>
            <Label>Attachments</Label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-muted-foreground/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
            >
              <Paperclip className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Drop files or click to attach (JPG, PNG, PDF)</p>
              <input ref={fileInputRef} type="file" className="hidden" multiple accept={ACCEPTED.join(',')}
                onChange={e => addFiles(Array.from(e.target.files ?? []))} />
            </div>
            {queuedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {queuedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted rounded px-2 py-1.5 text-xs">
                    {file.type.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" /> : <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                    <button type="button" onClick={() => setQueuedFiles(p => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Card'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
