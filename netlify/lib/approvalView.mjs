/**
 * De quem é a arte, para mostrar ao cliente.
 *
 * `client_name` é o campo certo, mas nem todo card tem: dois dos sessenta e
 * três estão sem, e nos dois o nome do cliente está no título da peça — "ANA
 * CAROLINE JOIAS", "TREOR". Quando o campo está vazio a prévia chegava sem
 * nome nenhum, só "Redantex · Aprovação de arte", que é justamente o que esta
 * mudança toda existia para evitar.
 *
 * É a mesma ordem que o relatório executivo já usava (`client_name || title`),
 * e o título já é mostrado ao cliente dentro da página de aprovação — nada
 * novo aparece para ele.
 *
 * Mora aqui, fora das duas funções, porque as duas precisam responder igual:
 * a de borda escreve o texto da prévia e a do cartão desenha a imagem. Cada
 * uma com a sua cópia da regra é como o mesmo link acabaria dizendo um nome
 * no texto e outro na figura.
 */
export function displayClient(view) {
  const pick = (value) => (typeof value === 'string' ? value.trim() : '')
  return pick(view?.client) || pick(view?.title) || ''
}
