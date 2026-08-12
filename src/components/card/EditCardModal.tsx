import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, BoardType, BOARD_COLUMNS, CardStatus, Priority } from '../../types'
import { useUpdateCard } from '../../hooks/useCards'
import { useToast } from '../ui/toast'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/select'
import { Label } from '../ui/label'
import { COLLECTIONS, LOGO_TECHNIQUES, OUTSIDE_MATERIALS, INSIDE_MATERIALS } from '../../lib/utils'

const schema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  status: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent'] as const),
  client_name: z.string().optional(),
  collection: z.string().optional(),
  quantity: z.number().positive().optional().or(z.literal('')),
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

type FormValues = z.infer<typeof schema>

interface EditCardModalProps {
  card: Card
  board: BoardType
  onClose: () => void
}

export function EditCardModal({ card, board, onClose }: EditCardModalProps) {
  const updateCard = useUpdateCard()
  const toast = useToast()
  const columns = BOARD_COLUMNS[board]

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: card.title,
      status: card.status,
      priority: card.priority as Priority,
      client_name: card.client_name ?? '',
      collection: card.collection ?? '',
      quantity: card.quantity ?? '',
      deadline: card.deadline ? card.deadline.substring(0, 10) : '',
      description: card.description ?? '',
      outside_material: card.outside_material ?? '',
      inside_material: card.inside_material ?? '',
      logo_color: card.logo_color ?? '',
      logo_technique_outside: card.logo_technique_outside ?? '',
      logo_technique_inside: card.logo_technique_inside ?? '',
      logo_text_outside: card.logo_text_outside ?? '',
      logo_text_inside: card.logo_text_inside ?? '',
      logo_color_outside: card.logo_color_outside ?? '',
      logo_color_inside: card.logo_color_inside ?? '',
      reference_code: card.reference_code ?? '',
      supplier_ref: card.supplier_ref ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await updateCard.mutateAsync({
        id: card.id,
        title: values.title,
        status: values.status as CardStatus,
        priority: values.priority as Priority,
        client_name: values.client_name || undefined,
        collection: values.collection || undefined,
        quantity: values.quantity ? Number(values.quantity) : undefined,
        deadline: values.deadline || undefined,
        description: values.description || undefined,
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
      toast('Card updated', 'success')
      onClose()
    } catch {
      toast('Failed to update card', 'error')
    }
  }

  return (
    <Dialog open onClose={onClose} size="lg" title="Edit Card">
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogHeader onClose={onClose}>
          Edit Card {card.ref_number && <span className="text-sm font-mono text-muted-foreground ml-2">{card.ref_number}</span>}
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input id="title" {...register('title')} autoFocus />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">Status</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="client_name">Client Name</Label>
              <Input id="client_name" {...register('client_name')} />
            </div>
            <div>
              <Label htmlFor="collection">Collection</Label>
              <Select id="collection" {...register('collection')}>
                <option value="">— Select —</option>
                {COLLECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" {...register('quantity', { valueAsNumber: true })} />
            </div>
            <div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Outside Material</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select id="outside_material" {...register('outside_material')}>
                  <option value="">— Select —</option>
                  {OUTSIDE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
                <Input placeholder="Material # (e.g. V-023)" {...register('outside_material_code')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Inside Material</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select id="inside_material" {...register('inside_material')}>
                  <option value="">— Select —</option>
                  {INSIDE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
                <Input placeholder="Material # (e.g. P-118)" {...register('inside_material_code')} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="logo_color">Logo Color</Label>
              <Input id="logo_color" {...register('logo_color')} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Logo</Label>
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Outside</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>Technique</Label><Select {...register('logo_technique_outside')}><option value="">— Select —</option>{LOGO_TECHNIQUES.map(t => <option key={t} value={t}>{t}</option>)}</Select></div>
                    <div><Label>Text / Brand</Label><Input {...register('logo_text_outside')} /></div>
                    <div><Label>Color</Label><Input {...register('logo_color_outside')} /></div>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Inside</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>Technique</Label><Select {...register('logo_technique_inside')}><option value="">— Select —</option>{LOGO_TECHNIQUES.map(t => <option key={t} value={t}>{t}</option>)}</Select></div>
                    <div><Label>Text / Brand</Label><Input {...register('logo_text_inside')} /></div>
                    <div><Label>Color</Label><Input {...register('logo_color_inside')} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" type="date" {...register('deadline')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="reference_code">Reference Code (RDX)</Label>
              <Input id="reference_code" {...register('reference_code')} />
            </div>
            <div>
              <Label htmlFor="supplier_ref">Supplier Ref (DEQI)</Label>
              <Input id="supplier_ref" {...register('supplier_ref')} />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description / Notes</Label>
            <Textarea id="description" rows={4} {...register('description')} />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={updateCard.isPending} disabled={!isDirty}>
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
