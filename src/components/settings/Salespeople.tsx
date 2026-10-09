import { useState } from 'react'
import { Users, Plus, Check, AlertCircle } from 'lucide-react'
import {
  useSalespeople, useCreateSalesperson, useUpdateSalesperson,
} from '../../hooks/useSalespeople'
import { useToast } from '../ui/toast'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Salesperson } from '../../types'

/**
 * The register of who sells — the twenty-five, not the five hub accounts.
 *
 * This is where the email address goes, and the email address is the whole
 * point: it is what puts the salesperson in copy of every notice the client
 * receives. A row without one still works everywhere else; it just means
 * nobody from the team is copied.
 *
 * Nobody is deleted, only switched off. Deleting would take the attribution
 * of every order they ever sold with them. Migration 056.
 */
export function Salespeople() {
  const { data: people, isLoading } = useSalespeople()
  const create = useCreateSalesperson()
  const toast = useToast()
  const [novo, setNovo] = useState('')
  const [novoEmail, setNovoEmail] = useState('')

  const active = people?.filter((p) => p.active) ?? []
  const off = people?.filter((p) => !p.active) ?? []
  const semEmail = active.filter((p) => !p.email?.trim()).length

  async function add() {
    const name = novo.trim()
    if (name.length < 2) { toast('Type the name first', 'error'); return }
    try {
      await create.mutateAsync({ name, email: novoEmail })
      setNovo(''); setNovoEmail('')
      toast(`${name} added`, 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Users className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Salespeople</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Everyone who sells, whether or not they log in here. The address is what puts them
            in copy of the notices their client receives.
          </p>

          {semEmail > 0 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md
              px-2.5 py-1.5 mt-3 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {semEmail} without an address — they are not copied on anything.
            </p>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {active.length} active
        </span>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground mt-4">Loading…</p>}

      <div className="mt-4 divide-y divide-border">
        {active.map((p) => <Linha key={p.id} person={p} />)}
      </div>

      {off.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            No longer selling
          </p>
          <div className="mt-1 divide-y divide-border">
            {off.map((p) => <Linha key={p.id} person={p} />)}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border flex items-end gap-2">
        <div className="flex-1">
          <Input placeholder="Name" value={novo} onChange={(e) => setNovo(e.target.value)} />
        </div>
        <div className="flex-1">
          <Input placeholder="Email (optional)" value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        </div>
        <Button size="sm" onClick={add} loading={create.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  )
}

function Linha({ person }: { person: Salesperson }) {
  const update = useUpdateSalesperson()
  const toast = useToast()
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [saved, setSaved] = useState(false)

  const dirty = name.trim() !== person.name || email.trim() !== (person.email ?? '')

  async function save() {
    if (!dirty) return
    if (name.trim().length < 2) { setName(person.name); return }
    try {
      await update.mutateAsync({ id: person.id, name, email })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      // Volta ao que estava: deixar o campo com o valor recusado faria a tela
      // mentir sobre o que está gravado.
      setName(person.name)
      setEmail(person.email ?? '')
      toast((err as Error).message, 'error')
    }
  }

  async function toggle() {
    try {
      await update.mutateAsync({ id: person.id, active: !person.active })
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Input className="h-8 text-xs flex-1" value={name}
        onChange={(e) => setName(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
      <Input className="h-8 text-xs flex-1" placeholder="no address" value={email}
        onChange={(e) => setEmail(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
      {saved && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
      {person.user_id && (
        <span className="text-[9px] text-muted-foreground border border-border rounded px-1 shrink-0">
          login
        </span>
      )}
      <button onClick={toggle}
        className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 w-14 text-right">
        {person.active ? 'Switch off' : 'Switch on'}
      </button>
    </div>
  )
}
