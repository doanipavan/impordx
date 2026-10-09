import { useState } from 'react'
import { Send, Plus, Check } from 'lucide-react'
import {
  useReportRecipients, useAddRecipient, useUpdateRecipient, Recipient,
} from '../../hooks/useReportRecipients'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

/**
 * Who gets the daily report.
 *
 * The list used to live in a Netlify environment variable, which meant adding
 * one person cost a deploy and needed the Netlify dashboard. It lives in the
 * database now, so this screen is the whole mechanism. Migration 059.
 *
 * Switching someone off keeps the row: a director who stops receiving it for
 * a month is not the same thing as a typo to be forgotten.
 */
export function Recipients() {
  const { data: lista, isLoading } = useReportRecipients()
  const add = useAddRecipient()
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')

  const ativos = lista?.filter((r) => r.active) ?? []

  async function incluir() {
    const addr = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      toast('That does not look like an email address', 'error')
      return
    }
    try {
      await add.mutateAsync({ name: nome, email: addr })
      setNome(''); setEmail('')
      toast('Added to the daily report', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Send className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Daily report</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Arrivals month by month, one column each, at 8am. Goes to Redantex only — the
            supplier is never on this list.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {ativos.length} receiving
        </span>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground mt-4">Loading…</p>}

      <div className="mt-4 divide-y divide-border">
        {(lista ?? []).map((r) => <Linha key={r.id} person={r} />)}
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-end gap-2">
        <div className="flex-1">
          <Input placeholder="Name (optional)" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="flex-1">
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') incluir() }} />
        </div>
        <Button size="sm" onClick={incluir} loading={add.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  )
}

function Linha({ person }: { person: Recipient }) {
  const update = useUpdateRecipient()
  const toast = useToast()
  const [nome, setNome] = useState(person.name ?? '')
  const [saved, setSaved] = useState(false)

  async function salvar() {
    if (nome.trim() === (person.name ?? '')) return
    try {
      await update.mutateAsync({ id: person.id, name: nome })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      setNome(person.name ?? '')
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Input className="h-8 text-xs w-40 shrink-0" placeholder="no name" value={nome}
        onChange={(e) => setNome(e.target.value)} onBlur={salvar}
        onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} />
      {/* O endereço não se edita: corrigir um email no lugar errado manda o
          relatório para quem não devia. Desliga-se este e inclui-se o certo. */}
      <span className={`flex-1 text-xs truncate ${person.active ? '' : 'text-muted-foreground line-through'}`}>
        {person.email}
      </span>
      {saved && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
      <button onClick={() => update.mutate({ id: person.id, active: !person.active })}
        className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 w-14 text-right">
        {person.active ? 'Switch off' : 'Switch on'}
      </button>
    </div>
  )
}
