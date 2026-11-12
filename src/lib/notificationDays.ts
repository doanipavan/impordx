/**
 * As notificações agrupadas por dia, uma coluna cada.
 *
 * O dia é o de São Paulo, como todo carimbo de hora do hub: a DEQI também
 * abre esta tela, e dez horas de diferença fariam o mesmo comentário cair em
 * dias diferentes para quem o escreveu e para quem o leu.
 *
 * Dias sem nada não viram coluna. Aqui, ao contrário dos meses do painel de
 * vendas, o vazio não é informação: fim de semana sem movimento é o normal, e
 * uma coluna "Sábado — nada" por semana só empurra o passado para longe.
 */

export interface DayGroup<T> {
  /** `YYYY-MM-DD` em São Paulo. */
  day: string
  label: string
  items: T[]
  unread: number
}

interface Timed {
  created_at: string
  read?: boolean
}

/** O dia de um instante, em São Paulo. */
export function dayInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso))
}

/** A hora, para o cartão. Dentro de uma coluna "Yesterday", "1 day ago" é só
 *  repetir o cabeçalho — a hora é o que de fato situa o evento. */
export function timeInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** O dia anterior a um `YYYY-MM-DD`, sem passar por fuso nenhum. */
function diaAnterior(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10)
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === diaAnterior(today)) return 'Yesterday'
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  const semana = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${semana}, ${d} ${MESES[m - 1]}`
}

/**
 * Agrupa por dia, do mais recente para o mais antigo.
 *
 * A ordem dentro de cada dia é a que veio — a consulta já traz do mais novo
 * para o mais velho, e reordenar aqui seria uma segunda regra para a mesma
 * coisa.
 */
export function groupByDay<T extends Timed>(items: T[], today: string): DayGroup<T>[] {
  const por = new Map<string, T[]>()
  for (const item of items) {
    const dia = dayInSaoPaulo(item.created_at)
    por.set(dia, [...(por.get(dia) ?? []), item])
  }
  return [...por.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, lista]) => ({
      day,
      label: dayLabel(day, today),
      items: lista,
      unread: lista.filter((n) => n.read === false).length,
    }))
}
