import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { User } from '../types'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, avatar_url, role, created_at')
        .order('full_name')
      if (error) throw error
      return data as User[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// Card owners are Redantex roles — a supplier account is never a salesperson
// or a project manager on Redantex's own work.
export function useRedantexUsers() {
  const query = useUsers()
  return {
    ...query,
    data: (query.data ?? []).filter(u => u.role === 'admin' || u.role === 'member'),
  }
}
