import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

/**
 * Escolher a senha nova, depois de clicar no link do email.
 *
 * Mostrada por cima de qualquer rota: o link de recuperação cria uma sessão
 * de verdade, então sem esta tela a pessoa entraria direto no hub e a senha
 * continuaria a antiga — a que ela não sabe.
 *
 * Oito caracteres, não seis. Seis é o mínimo que o Supabase aceita, e o
 * mínimo de quem valida não precisa ser o mínimo de quem decide.
 */
const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: 'The two passwords are different',
  path: ['confirm'],
})
type FormValues = z.infer<typeof schema>

export function ResetPasswordPage() {
  const { updatePassword, signOut, supabaseUser } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ password }: FormValues) => {
    setError(null)
    const { error } = await updatePassword(password)
    // O Supabase recusa a senha anterior com uma mensagem técnica; quem está
    // nesta tela esqueceu a senha e não precisa ler a frase dele.
    if (error) {
      setError(/same/i.test(error)
        ? 'That is the password you already had. Choose a different one.'
        : error)
      return
    }
    // Já está dentro: a sessão veio do próprio link. Recarregar é o caminho
    // mais honesto — o hub abre do zero, com a senha nova valendo.
    window.location.replace('/')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.webp" alt="Redantex" className="h-12 mx-auto mb-5 object-contain" />
          <h1 className="text-xl font-bold tracking-wide text-foreground">Choose a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {supabaseUser?.email
              ? <>You are setting the password for <span className="font-medium text-foreground">{supabaseUser.email}</span></>
              : 'This link signed you in. Pick the password you will use from now on.'}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" autoComplete="new-password"
              autoFocus className="mt-1" {...register('password')} />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <Label htmlFor="confirm">Repeat it</Label>
            <Input id="confirm" type="password" autoComplete="new-password"
              className="mt-1" {...register('confirm')} />
            {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm.message}</p>}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting}>
            <KeyRound className="h-4 w-4 mr-2" />
            Save and enter
          </Button>
        </form>

        {/* Sem esta saída, quem abriu o link por engano fica preso nesta tela:
            a sessão de recuperação é válida e o hub não aparece por trás. */}
        <button type="button"
          onClick={async () => { await signOut(); window.location.replace('/login') }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-6 transition-colors">
          Cancel and sign out
        </button>
      </div>
    </div>
  )
}
