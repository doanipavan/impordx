-- O que o cliente ouviu, gravado na hora em que ouviu.
--
-- A fila já guarda o assunto do email. Falta a informação que o aviso
-- carregava: a faixa de chegada que foi dita. Sem ela, mostrar o histórico no
-- painel obrigaria a recalcular a previsão de hoje e exibi-la ao lado de uma
-- mensagem de outubro — o vendedor leria que o cliente foi informado de uma
-- coisa que ninguém lhe disse. Previsão muda; o que foi dito, não.
--
-- Por isso a frase é gravada pelo remetente, no instante do envio, e nunca
-- recalculada depois.

alter table email_outbox add column if not exists summary text;

comment on column email_outbox.summary is
  'Uma linha do que o aviso informou — a faixa de chegada dita ao cliente. '
  'Escrita no envio e imutável: é registro, não cálculo.';
