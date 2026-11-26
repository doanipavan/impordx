import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormValues = z.infer<typeof schema>

const emailOnly = z.object({ email: z.string().email('Enter a valid email address') })
type EmailValues = z.infer<typeof emailOnly>

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  return mode === 'forgot'
    ? <ForgotPassword onBack={() => setMode('signin')} />
    : <SignIn onForgot={() => setMode('forgot')} />
}

function SignIn({ onForgot }: { onForgot: () => void }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email, password }: FormValues) => {
    setError(null)
    const { error } = await signIn(email, password)
    if (error) {
      if (error.toLowerCase().includes('invalid')) setError('Invalid email or password. Please try again.')
      else if (error.toLowerCase().includes('expired')) setError('Your session has expired. Please sign in again.')
      else setError(error)
      return
    }
    navigate('/')
  }

  return (
    <Shell subtitle="Sign in to your workspace">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="mt-1"
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            {/* Em vez de uma rota própria: a recuperação é a mesma tela com um
                campo a menos, e uma rota a mais seria um endereço que só
                existe para quem já está aqui. */}
            <button type="button" onClick={onForgot}
              className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Forgot your password?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="mt-1"
            {...register('password')}
          />
          {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Access is by invitation only.<br />
        Contact your workspace administrator if you need access.
      </p>
    </Shell>
  )
}

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const { resetPassword } = useAuth()
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailValues>({
    resolver: zodResolver(emailOnly),
  })

  const onSubmit = async ({ email }: EmailValues) => {
    setError(null)
    const { error } = await resetPassword(email)
    // O Supabase responde igual para endereço que existe e para endereço que
    // não existe, de propósito — senão esta tela viraria um jeito de
    // descobrir quem tem conta. A frase abaixo diz o mesmo nos dois casos.
    if (error) { setError(error); return }
    setSent(email.trim())
  }

  if (sent) {
    return (
      <Shell subtitle="Check your email">
        <div className="rounded-md border border-border bg-muted/40 px-4 py-4 text-sm text-center">
          <MailCheck className="h-5 w-5 mx-auto mb-2 text-primary" />
          <p className="text-foreground">
            If <span className="font-medium">{sent}</span> has an account, the link is on its way.
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            It expires in an hour and works once. Look in the spam folder before asking for another.
          </p>
        </div>
        <button type="button" onClick={onBack}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground
                     hover:text-foreground mt-6 transition-colors">
          <ArrowLeft className="h-3 w-3" /> Back to sign in
        </button>
      </Shell>
    )
  }

  return (
    <Shell subtitle="We will email you a link to choose a new one">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="recover-email">Email address</Label>
          <Input id="recover-email" type="email" autoComplete="email" autoFocus
            placeholder="you@company.com" className="mt-1" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Send the link
        </Button>
      </form>

      <button type="button" onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground
                   hover:text-foreground mt-6 transition-colors">
        <ArrowLeft className="h-3 w-3" /> Back to sign in
      </button>
    </Shell>
  )
}

function Shell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.webp" alt="Redantex" className="h-12 mx-auto mb-5 object-contain" />
          <h1 className="text-xl font-bold tracking-wide text-foreground">IMPO RDX</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
