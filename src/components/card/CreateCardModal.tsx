import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BoardType, CardStatus, BOARD_COLUMNS, BOARD_LABELS, Priority } from '../../types'
import { useCreateCard } from '../../hooks/useCards'
import { useToast } from '../ui/toast'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/select'
import { Label } from '../ui/label'
import { COLLECTIONS, LOGO_TECHNIQUES, LOGO_POSITIONS, OUTSIDE_MATERIALS, INSIDE_MATERIALS } from '../../lib/utils'

const schema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  status: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent'] as const),
  client_name: z.string().optional(),
  collection: z.string().optional(),
  quantity: z.number().positive().optional().or(z.literal('')),
  value_usd: z.number().positive().optional().or(z.literal('')),
  deadline: z.string().optional(),
  description: z.string().optional(),
  size: z.string().optional(),
  outside_material: z.string().optional(),
  inside_material: z.string().optional(),
  logo_color: z.string().optional(),
  logo_technique: z.string().optional(),
  reference_code: z.string().optional(),
  supplier_ref: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface CreateCardModalProps {
  board: BoardType
  initialStatus: CardStatus
  onClose: () => void
}

export function CreateCardModal({ board, initialStatus, onClose }: CreateCardModalProps) {
  const createCard = useCreateCard()
  const toast = useToast()

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: initialStatus,
      priority: 'medium',
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await createCard.mutateAsync({
        board,
        status: values.status as CardStatus,
        title: values.title,
        priority: values.priority as Priority,
        client_name: values.client_name || undefined,
        collection: values.collection || undefined,
        quantity: values.quantity ? Number(values.quantity) : undefined,
        value_usd: values.value_usd ? Number(values.value_usd) : undefined,
        deadline: values.deadline || undefined,
        description: values.description || undefined,
        size: values.size || undefined,
        outside_material: values.outside_material || undefined,
        inside_material: values.inside_material || undefined,
        logo_color: values.logo_color || undefined,
        logo_technique: values.logo_technique || undefined,
        reference_code: values.reference_code || undefined,
        supplier_ref: values.supplier_ref || undefined,
      })
      toast('Card created', 'success')
      onClose()
    } catch {
      toast('Failed to create card. Please try again.', 'error')
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
            <Input
              id="title"
              placeholder="e.g. Parma 300pcs Navy Blue — Quote Request"
              {...register('title')}
              autoFocus
            />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <Label htmlFor="status">Initial Status</Label>
              <Select id="status" {...register('status')}>
                {columns.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>

            {/* Priority */}
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
            {/* Client */}
            <div>
              <Label htmlFor="client_name">Client Name</Label>
              <Input id="client_name" placeholder="e.g. Lize Joias" {...register('client_name')} />
            </div>

            {/* Collection */}
            <div>
              <Label htmlFor="collection">Collection</Label>
              <Select id="collection" {...register('collection')}>
                <option value="">— Select —</option>
                {COLLECTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Quantity */}
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" placeholder="300" {...register('quantity', { valueAsNumber: true })} />
            </div>

            {/* Value */}
            <div>
              <Label htmlFor="value_usd">Value (USD)</Label>
              <Input id="value_usd" type="number" step="0.01" placeholder="0.00" {...register('value_usd', { valueAsNumber: true })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Outside material */}
            <div>
              <Label htmlFor="outside_material">Outside Material</Label>
              <Select id="outside_material" {...register('outside_material')}>
                <option value="">— Select —</option>
                {OUTSIDE_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>

            {/* Inside material */}
            <div>
              <Label htmlFor="inside_material">Inside Material</Label>
              <Select id="inside_material" {...register('inside_material')}>
                <option value="">— Select —</option>
                {INSIDE_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Logo color */}
            <div>
              <Label htmlFor="logo_color">Logo Color</Label>
              <Input id="logo_color" placeholder="e.g. Gold, White" {...register('logo_color')} />
            </div>

            {/* Logo technique */}
            <div>
              <Label htmlFor="logo_technique">Logo Technique</Label>
              <Select id="logo_technique" {...register('logo_technique')}>
                <option value="">— Select —</option>
                {LOGO_TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Size */}
            <div>
              <Label htmlFor="size">Size (cm)</Label>
              <Input id="size" placeholder="16 x 16 x 3.5" {...register('size')} />
            </div>

            {/* Deadline */}
            <div>
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="date" {...register('deadline')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Reference code */}
            <div>
              <Label htmlFor="reference_code">Reference Code (RDX)</Label>
              <Input id="reference_code" placeholder="500578" {...register('reference_code')} />
            </div>

            {/* Supplier ref */}
            <div>
              <Label htmlFor="supplier_ref">Supplier Ref (DEQI)</Label>
              <Input id="supplier_ref" {...register('supplier_ref')} />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description / Notes</Label>
            <Textarea
              id="description"
              placeholder="Additional details, special instructions, color references..."
              rows={3}
              {...register('description')}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={createCard.isPending}>Create Card</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
