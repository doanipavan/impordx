import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Supplier } from '../types'

const STORAGE_KEY = 'rdx.supplierFilter'

/** 'all', or a supplier id. */
export type SupplierFilter = string

/**
 * The supplier scope, shared by every view that shows cards.
 *
 * It lives outside React so the board, the Gantt and the page header all read
 * one value and re-render together — a filter that means one thing above the
 * chart and another inside it is worse than no filter. Subscribers are held in
 * a plain Set rather than a context provider, which keeps this usable from any
 * component without threading a provider through the tree.
 *
 * This is convenience, not protection. What a supplier account may read is
 * decided by the database (migration 031); hiding rows here would do nothing
 * for someone calling the API directly, exactly as with value_brl.
 */
let current: SupplierFilter = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'all'
  } catch {
    return 'all'
  }
})()

const listeners = new Set<(v: SupplierFilter) => void>()

export function setSupplierFilter(value: SupplierFilter) {
  current = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Private windows and blocked site data both throw here. The filter still
    // works for this session; it just will not be remembered.
  }
  listeners.forEach((fn) => fn(value))
}

export function useSupplierFilter(): [SupplierFilter, (v: SupplierFilter) => void] {
  const [value, setValue] = useState(current)
  useEffect(() => {
    listeners.add(setValue)
    // Another component may have changed it between render and effect.
    if (current !== value) setValue(current)
    return () => { listeners.delete(setValue) }
  }, [value])
  return [value, setSupplierFilter]
}

/**
 * Every supplier this account can see.
 *
 * A supplier login gets exactly one row back — its own — because of the
 * suppliers policy in migration 032. That is what hides the switch for Ashley
 * and Carlos: with one supplier there is nothing to switch between.
 */
export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, short_name, active')
        .order('short_name')
      if (error) throw error
      return (data ?? []) as Supplier[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Keeps the cards a filter admits. */
export function matchesSupplier(card: { supplier_id?: string }, filter: SupplierFilter): boolean {
  return filter === 'all' || card.supplier_id === filter
}
