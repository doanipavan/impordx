import { useEffect, useState } from 'react'

const STORAGE_KEY = 'rdx.timeline.density'

/**
 * Quanta coisa cada barra carrega.
 *
 * `clean` é o padrão: sem as palavras dentro da barra, sem os pontos do
 * histórico, e o losango do fornecedor só quando a data dele já passou do dia
 * 60 do plano. `full` traz tudo de volta, como a tela era até 27/nov/2026.
 *
 * É um interruptor de densidade, não duas telas. O agrupamento por mês vale
 * nos dois: ele não é gosto, é o que faz quarenta e cinco linhas serem
 * legíveis. E dois desenhos completos seriam duas réguas para discordarem —
 * que é exatamente como dois pedidos já caíram deste gráfico.
 *
 * Mora fora do React, como `useSupplierFilter` e `useHideArrived`, porque o
 * botão está no cabeçalho da página e as barras estão dentro do gráfico.
 */
export type Density = 'clean' | 'full'

function guardado(): Density {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : 'clean'
  } catch {
    // Aba privada ou dados do site bloqueados: abre limpo e funciona igual.
    return 'clean'
  }
}

let atual: Density = guardado()
const listeners = new Set<(v: Density) => void>()

export function setDensity(value: Density) {
  atual = value
  try { localStorage.setItem(STORAGE_KEY, value) } catch { /* idem */ }
  listeners.forEach((fn) => fn(value))
}

export function useDensity(): Density {
  const [value, setValue] = useState(atual)
  useEffect(() => {
    listeners.add(setValue)
    if (atual !== value) setValue(atual)
    return () => { listeners.delete(setValue) }
  }, [value])
  return value
}
