import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../ui/button'
import { useAuth } from '../../hooks/useAuth'
import { useHideArrived, setHideArrived } from '../../hooks/useHideArrived'

/**
 * O botão que tira da régua o que já terminou.
 *
 * Fica no cabeçalho da página, junto do filtro de fornecedor e do relatório,
 * porque é ali que se procura um controle. Dentro do gráfico, na faixa da
 * legenda, ele não foi encontrado.
 *
 * Só aparece quando há o que esconder: um botão que não faz nada é uma
 * pergunta sem resposta. E ligado ele troca de cor e passa a dizer o número,
 * porque um filtro esquecido ligado é um pedido que desapareceu.
 */
export function HideArrivedButton() {
  const { user } = useAuth()
  const { hidden, count } = useHideArrived()

  // O fornecedor nunca vê `Arrived` — a perna dele acaba no embarque, e o dia
  // em que a mercadoria chegou ao Brasil não é dele.
  const palavra = user?.role === 'viewer' ? 'shipped' : 'arrived'

  if (count === 0) return null

  return (
    <Button
      variant={hidden ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setHideArrived(!hidden)}
      title={hidden
        ? `${count} ${palavra} ${count === 1 ? 'order is' : 'orders are'} hidden. Click to bring ${count === 1 ? 'it' : 'them'} back.`
        : `Hide the ${count} ${palavra} ${count === 1 ? 'order' : 'orders'} and keep the running ones`}
      className={hidden
        ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
        : undefined}>
      {hidden
        ? <Eye className="h-3.5 w-3.5 mr-1.5" />
        : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
      {hidden ? `${count} ${palavra} hidden` : `Hide ${palavra} · ${count}`}
    </Button>
  )
}
