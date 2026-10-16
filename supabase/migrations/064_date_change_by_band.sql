-- O aviso de data passa a disparar pela faixa, não pelos dias.
--
-- O gatilho disparava quando a data da fábrica andava mais de cinco dias. Mas
-- o cliente não lê a data da fábrica: lê uma faixa de dez dias de chegada ao
-- Brasil. E um atraso de seis — às vezes sete — dias cai dentro da mesma
-- faixa:
--
--   +6d  25/11 → 01/12   chegada 14/01 → 20/01   "11 a 20 de janeiro" nos dois
--   +7d  14/11 → 21/11   chegada 03/01 → 10/01   "1 a 10 de janeiro" nos dois
--
-- O cliente recebia um email anunciando mudança e lia exatamente o que já
-- sabia. Na segunda vez, para de acreditar nos avisos — e aí o aviso que
-- importa também não é lido.
--
-- Agora a pergunta é outra: **mudou o que ele vai ler?** Se a faixa é a
-- mesma, não houve notícia, por maior que tenha sido o movimento da fábrica.
-- E se a faixa mudou, houve notícia mesmo que a fábrica tenha andado um dia
-- só — o que acontece quando a data cruza o fim de um terço de mês.

-- A meta de logística vive em `LOGISTICS_TARGET_DAYS`, em src/lib/utils.ts, e
-- de propósito não é guardada em lugar nenhum: a regra já mudou três vezes, e
-- um valor gravado continuaria respondendo com a regra morta. Aqui ela
-- precisa existir para saber em que faixa a chegada cai, então é uma cópia —
-- e `scripts/check-client-email.mjs` compara este número com o do código e
-- falha se divergirem.
create or replace function arrival_band(p_ready date)
returns text
language sql
immutable
as $$
  select case
    when p_ready is null then null
    else to_char(p_ready + 50, 'YYYY-MM') || '-' ||
         case when extract(day from p_ready + 50) <= 10 then '1'
              when extract(day from p_ready + 50) <= 20 then '2'
              else '3' end
  end
$$;

comment on function arrival_band is
  'A faixa de dez dias que o cliente lê, a partir da data da fábrica. '
  'Os 50 dias são cópia de LOGISTICS_TARGET_DAYS; há trava no teste.';

create or replace function enqueue_client_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  destino text;
  nome    text;
begin
  if new.board <> 'orders' then return new; end if;
  if new.archived then return new; end if;
  if new.delivery_date is null or old.delivery_date is null then return new; end if;
  if new.delivery_date = old.delivery_date then return new; end if;

  -- O que decide é a faixa que o cliente lê, não o tamanho do movimento.
  -- Vale para mais e para menos: antecipar também é notícia, e o cliente pode
  -- precisar se preparar para receber antes.
  if arrival_band(old.delivery_date) = arrival_band(new.delivery_date) then
    return new;
  end if;

  -- O pedido precisa estar vivo e já conhecido do cliente. Antes de Placed
  -- ele nunca ouviu falar em data nenhuma, e receberia a correção de uma
  -- promessa que não lhe foi feita.
  if new.status not in ('Placed', 'In Production', 'Ready to Ship',
                        'Collected', 'Shipped') then
    return new;
  end if;

  select btrim(c.email), c.name into destino, nome
    from clients c where c.id = new.client_id;
  if destino is null or destino = '' then return new; end if;

  -- Se já existe um aviso de data esperando na fila, ele ainda não saiu e vai
  -- sair com a data mais recente — a função relê o card na hora de enviar.
  -- Duas remarcações na mesma tarde viram um email, não dois.
  if exists (
    select 1 from email_outbox
     where card_id = new.id and kind = 'date-change' and status = 'pending'
  ) then
    return new;
  end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind)
  values (new.id, new.client_id, new.ref_number, nome, destino, 'date-change');

  return new;
exception when others then
  raise warning 'enqueue_client_date_change falhou no card %: %', new.id, sqlerrm;
  return new;
end;
$$;
