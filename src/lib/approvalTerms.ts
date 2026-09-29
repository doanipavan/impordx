/**
 * O Termo de Aprovação de Produto Personalizado, da Redantex.
 *
 * O texto vive aqui, em um lugar só: a tela do cliente o exibe e o comprovante
 * em PDF o repete. Duas cópias do mesmo termo é como um cliente acaba
 * assinando uma versão e recebendo outra.
 *
 * Os três campos que o documento em papel deixa em branco — pedido, versão da
 * arte e data — são preenchidos pelo próprio hub no momento da assinatura, e
 * é isso que amarra o termo à arte que estava na tela.
 */

export interface TermsSection {
  n: number
  heading: string
  body?: string[]
  bullets?: string[]
}

export const TERMS_TITLE = 'Termo de Aprovação de Produto Personalizado e Customizado / Sob Encomenda'

export const TERMS_INTRO =
  'A Redantex desenvolve produtos personalizados e sob encomenda de acordo com as características, ' +
  'informações e escolhas definidas para cada pedido. Por isso, a produção somente será iniciada após ' +
  'a aprovação da arte e das especificações do pedido realizado pelo cliente.'

export const TERMS_SECTIONS: TermsSection[] = [
  {
    n: 1,
    heading: 'Conferência e aprovação do pedido',
    body: [
      'Antes da liberação da produção, o cliente deverá realizar a conferência e aprovação das informações ' +
      'constantes no pedido e na arte digital, que serão utilizadas como referência para fabricação do produto, incluindo:',
    ],
    bullets: [
      'Produto, modelo e quantidade;',
      'Medidas e dimensões;',
      'Nomes, textos e grafias;',
      'Logotipo e elementos gráficos;',
      'Posicionamento da personalização;',
      'Cores, materiais e acabamentos;',
      'Demais características específicas do projeto.',
    ],
  },
  {
    n: 2,
    heading: 'Sobre a arte digital',
    body: [
      'A arte digital é uma representação criada para conferência dos elementos de personalização antes da produção.',
      'Por ser uma visualização em tela, podem ocorrer pequenas diferenças de percepção relacionadas à iluminação, ' +
      'brilho, resolução ou configuração do dispositivo utilizado.',
      'Além disso, determinados materiais e processos produtivos podem apresentar variações naturais de textura, ' +
      'tonalidade, relevo, impressão, gravação, costura ou acabamento, desde que estejam de acordo com as ' +
      'características contratadas.',
    ],
  },
  {
    n: 3,
    heading: 'Autorização para produção',
    body: [
      'Após a aprovação da arte e das especificações do pedido, o cliente autoriza a Redantex a iniciar a produção ' +
      'do produto personalizado.',
      'Após essa etapa, eventuais alterações solicitadas pelo cliente dependerão de análise de viabilidade e poderão gerar:',
    ],
    bullets: [
      'Novo orçamento ou custos adicionais;',
      'Nova aprovação de arte;',
      'Alteração do prazo de produção e entrega.',
    ],
  },
  {
    n: 4,
    heading: 'Produto conforme aprovação',
    body: [
      'Os produtos personalizados são produzidos especialmente conforme as informações aprovadas pelo cliente.',
      'Por serem produtos produzidos especialmente para cada pedido, após a aprovação final da arte e autorização ' +
      'para produção, não será possível realizar o cancelamento do pedido, troca ou devolução por motivo de ' +
      'mudança de preferência.',
    ],
  },
  {
    n: 5,
    heading: 'Prazo e alterações no pedido',
    body: [
      'O prazo informado para produção e entrega será considerado a partir da aprovação final da arte e das demais ' +
      'condições necessárias para liberação do pedido.',
      'Alterações solicitadas após a aprovação poderão impactar o prazo inicialmente informado, sendo comunicadas ' +
      'e registradas previamente.',
    ],
  },
]

// ATENÇÃO — cláusula acrescentada pelo hub em 28/09/2026, ainda **não revisada
// pelo jurídico da Redantex**. É ela que faz a assinatura eletrônica simples
// valer entre as partes (MP 2.200-2/2001, art. 10, §2º): sem o aceite expresso
// do meio, o registro existe mas o documento não diz que ele vale.
export const TERMS_ELECTRONIC: TermsSection = {
  n: 6,
  heading: 'Aceite eletrônico e conferência',
  body: [
    'As partes reconhecem como válida e vinculante a aprovação manifestada por meio eletrônico nesta ' +
    'plataforma, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.',
    'O aceite é comprovado pelo registro eletrônico gerado no momento da assinatura, que contém nome, ' +
    'e-mail, documento informado, data e hora, endereço IP, dispositivo utilizado, o conteúdo exato ' +
    'apresentado na tela e o seu resumo criptográfico (hash SHA-256).',
    'Cada aprovação recebe um código de conferência, impresso no comprovante, que permite verificar o ' +
    'registro a qualquer tempo em impordx.netlify.app/verificar.',
  ],
}

/** O parágrafo que o cliente assina — o mesmo que a caixinha repete. */
export const TERMS_CONFIRMATION_N = 7

export const TERMS_CONFIRMATION = [
  'Declaro que conferi as informações do meu pedido, tive acesso à arte digital e estou de acordo com as ' +
  'especificações informadas.',
  'Confirmo a aprovação da arte e autorizo a produção do pedido conforme as características apresentadas.',
]

export const TERMS_SIGNATORY = 'Redantex Expositores e Embalagens'

/** Frase curta ao lado da caixinha, para quem não vai ler as seis seções. */
export const TERMS_CHECKBOX_LABEL =
  'Li e aceito o Termo de Aprovação de Produto Personalizado, no fim desta página.'

/** O que preenche os campos que o papel deixa em branco. */
export interface TermsFields {
  /** Pedido — a referência do card. */
  order: string
  /** Versão da arte aprovada — o arquivo que está na tela. */
  artVersion: string
  /** Data da aprovação — preenchida na hora de assinar. */
  date: string
}
