import { useEffect } from 'react'

/**
 * Marca a página como portuguesa e pede ao navegador que não traduza.
 *
 * O `index.html` declara `lang="en"` porque o hub é em inglês. As páginas do
 * cliente não são, e o Chrome, vendo inglês declarado e português na tela,
 * chutou espanhol e traduziu por cima: "enviou" virou "inveja", "aceite"
 * virou "óleo" — aceite é azeite em espanhol. Apareceu no computador de uma
 * cliente da Redantex.
 *
 * Numa página qualquer seria só feio. Nestas alguém assina um termo, e o
 * retrato que vira hash guarda o texto em português: um navegador que
 * reescreve as palavras faz a pessoa assinar o que não leu.
 *
 * Quem resolve isso de verdade é a função de borda, que corrige o HTML antes
 * de ele chegar ao navegador. Aqui é a segunda linha: numa página que só
 * ganha texto depois que o JavaScript roda, isto ainda chega a tempo se a
 * função de borda não tiver rodado.
 */
export function usePortuguesePage() {
  useEffect(() => {
    const root = document.documentElement
    const before = { lang: root.lang, translate: root.getAttribute('translate') }

    root.lang = 'pt-BR'
    root.setAttribute('translate', 'no')

    // O hub fica inglês de novo quando o usuário sai destas páginas sem
    // recarregar — acontece com quem tem conta e abre o link.
    return () => {
      root.lang = before.lang
      if (before.translate === null) root.removeAttribute('translate')
      else root.setAttribute('translate', before.translate)
    }
  }, [])
}
