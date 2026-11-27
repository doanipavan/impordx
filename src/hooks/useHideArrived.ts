import { useEffect, useState } from 'react'

const STORAGE_KEY = 'rdx.timeline.hideDone'

/**
 * Esconder da régua o que já terminou.
 *
 * Mora fora do React, como `useSupplierFilter`, pelo mesmo motivo: o botão
 * está no cabeçalho da página e as linhas estão dentro do gráfico, e um
 * filtro que vale num lugar e não no outro é pior que filtro nenhum.
 *
 * O botão nasceu dentro do gráfico, na faixa da legenda, e a primeira pessoa
 * a procurá-lo não o achou. Todo controle daquela tela mora em cima — o
 * filtro de fornecedor, o relatório — e contraste não conserta endereço
 * errado. Subiu para junto deles em 27/nov.
 *
 * `count` é publicado pelo gráfico, não calculado aqui: quantas linhas há
 * para esconder depende do recorte do fornecedor e de quem está olhando, e
 * recalcular isso no cabeçalho seria a segunda leitura da mesma régua — que
 * é exatamente como dois pedidos já caíram do gráfico.
 */
export interface HideArrived {
  /** O filtro está ligado. */
  hidden: boolean
  /** Quantas linhas ele tira de vista no recorte atual. */
  count: number
}

function guardado(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Aba privada ou dados do site bloqueados. O filtro funciona nesta
    // sessão; só não é lembrado na próxima.
    return false
  }
}

let estado: HideArrived = { hidden: guardado(), count: 0 }
const listeners = new Set<(v: HideArrived) => void>()

function emitir() {
  listeners.forEach((fn) => fn(estado))
}

export function setHideArrived(hidden: boolean) {
  estado = { ...estado, hidden }
  try { localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0') } catch { /* idem */ }
  emitir()
}

/** O gráfico diz quantas linhas terminadas existem no recorte que desenhou. */
export function publishArrivedCount(count: number) {
  if (estado.count === count) return
  estado = { ...estado, count }
  emitir()
}

export function useHideArrived(): HideArrived {
  const [value, setValue] = useState(estado)
  useEffect(() => {
    listeners.add(setValue)
    // Outro componente pode ter mudado entre o render e o efeito.
    if (estado !== value) setValue(estado)
    return () => { listeners.delete(setValue) }
  }, [value])
  return value
}
