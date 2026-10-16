-- Ver o email antes do cliente, e alcançar quem foi cadastrado tarde.
--
-- Dois buracos da revisão de 16/10/2026, com a mesma raiz: não havia como
-- exercer o sistema sem usar um cliente de verdade.
--
--   **Prévia.** Para conferir como um aviso chega, era preciso mover um card
--   de um cliente que tem email — ou seja, escrever para ele. Com 46 clientes
--   ainda por cadastrar, isso significa descobrir os erros no destinatário.
--
--   **Cadastro tardio.** O gatilho de etapa só dispara quando o card se move.
--   Cadastrar o email de um cliente cujo pedido já está em produção faz com
--   que ele nunca receba "pedido confirmado" nem "em produção" — e o primeiro
--   contato da Redantex com ele pode ser "sua mercadoria chegou ao Brasil".
--   Com 46 por cadastrar, esse é o caso normal, não a exceção.

alter table email_outbox add column if not exists preview boolean not null default false;

comment on column email_outbox.preview is
  'Linha de prévia: vai para quem pediu, nunca para o cliente. O histórico '
  'do card e as contagens da tela ignoram estas linhas — prévia não é aviso.';

-- ---------------------------------------------------------------------------
-- A prévia
-- ---------------------------------------------------------------------------

/*
 * Enfileira uma cópia do aviso para quem está pedindo, e só para ele.
 *
 * O destinatário **não é parâmetro**: sai de `auth.uid()`. É o que impede
 * esta função de virar um jeito de mandar um email de cliente para qualquer
 * endereço — o pior desfecho possível para uma função que monta mensagem com
 * nome de cliente, valor e prazo dentro.
 */
create or replace function preview_queue(p_card uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  meu_email text;
  ref       text;
  cliente   text;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can preview a client notice';
  end if;

  if p_kind not in ('stage:Placed', 'stage:In Production', 'stage:Ready to Ship',
                    'stage:Collected', 'stage:Shipped', 'stage:Arrived',
                    'reminder', 'date-change', 'date-confirmed', 'sample-approved') then
    raise exception 'Unknown notice kind: %', p_kind;
  end if;

  select btrim(u.email) into meu_email from users u where u.id = auth.uid();
  if meu_email is null or meu_email = '' then
    raise exception 'Your account has no email address';
  end if;

  select c.ref_number, coalesce(cl.name, c.client_name)
    into ref, cliente
    from cards c left join clients cl on cl.id = c.client_id
   where c.id = p_card;
  if ref is null then raise exception 'No such card'; end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind, preview)
  select p_card, c.client_id, ref, cliente, meu_email, 'preview:' || p_kind, true
    from cards c where c.id = p_card;

  return meu_email;
end;
$$;

revoke all on function preview_queue(uuid, text) from public, anon;
grant execute on function preview_queue(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- O alcance de quem entrou tarde
-- ---------------------------------------------------------------------------

/*
 * Manda a um cliente recém-cadastrado um "onde seu pedido está" de cada
 * pedido aberto dele.
 *
 * Usa o lembrete, que é exatamente esse texto, em vez de inventar um aviso
 * novo: o cliente recebe a mesma mensagem que receberia no décimo quinto dia,
 * só que agora. Um email por pedido, porque é assim que o resto do sistema
 * trata pedido — foi decisão explícita de não juntar.
 */
create or replace function client_catchup(p_client uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  destino text;
  n       int := 0;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can do this';
  end if;

  select btrim(email) into destino from clients where id = p_client;
  if destino is null or destino = '' then
    raise exception 'This client has no email address';
  end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind)
  select c.id, c.client_id, c.ref_number, cl.name, destino, 'reminder'
    from cards c join clients cl on cl.id = c.client_id
   where c.client_id = p_client
     and c.board = 'orders'
     and not c.archived
     -- As mesmas etapas de que o cliente pode ouvir falar. `Arrived` fica de
     -- fora: não se "alcança" alguém sobre mercadoria que já chegou.
     and c.status in ('Placed', 'In Production', 'Ready to Ship',
                      'Collected', 'Shipped')
     -- Nada que já esteja esperando na fila para este card.
     and not exists (
       select 1 from email_outbox o
        where o.card_id = c.id and o.status = 'pending' and not o.preview);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function client_catchup(uuid) from public, anon;
grant execute on function client_catchup(uuid) to authenticated, service_role;

-- O lembrete automático não pode confundir prévia com aviso: um cliente que
-- recebeu só uma prévia (que nem foi para ele) continua em silêncio há quinze
-- dias.
create or replace function orders_needing_reminder(dias int default 15)
returns table (
  card_id uuid, client_id uuid, card_ref text, client_name text, to_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.client_id, c.ref_number, cl.name, btrim(cl.email)
    from cards c
    join clients cl on cl.id = c.client_id
   where c.board = 'orders'
     and not c.archived
     and c.status in ('Placed', 'In Production', 'Ready to Ship',
                      'Collected', 'Shipped')
     and btrim(coalesce(cl.email, '')) <> ''
     and not exists (
       select 1 from email_outbox o
        where o.card_id = c.id
          and o.status in ('pending', 'sent')
          and not o.preview
          and o.created_at > now() - make_interval(days => dias)
     )
$$;
