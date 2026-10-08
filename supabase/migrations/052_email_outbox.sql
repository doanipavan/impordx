-- A fila de emails, e o gatilho que a alimenta.
--
-- Por que fila, e não envio direto do gatilho: um gatilho roda dentro da
-- transação que move o card. Se o provedor de email estiver lento ou fora do
-- ar, arrastar um pedido no quadro passaria a falhar — e nada no hub deve
-- depender de um servidor de email para funcionar. É a mesma razão pela qual
-- `notify_on_comment` e `notify_on_status_change` engolem os próprios erros:
-- o aviso nunca pode ser o motivo de o trabalho não salvar.
--
-- Então o gatilho só anota. Uma função agendada esvazia a fila depois, com
-- direito a retentativa — e o que sobra na tabela é o registro de quem foi
-- avisado de quê e quando, que hoje não existe em lugar nenhum.

create table if not exists email_outbox (
  id          uuid primary key default gen_random_uuid(),

  -- O card e o cliente podem sumir; o registro do que foi enviado, não.
  -- Um card apagado levou embora a assinatura de uma cliente em 30 Set 2026
  -- porque a chave era `on delete cascade`. Aqui não se repete: a referência
  -- se desfaz e o texto fica.
  card_id     uuid references cards(id) on delete set null,
  client_id   uuid references clients(id) on delete set null,
  card_ref    text,
  client_name text,

  to_email    text not null,
  kind        text not null,
  subject     text,

  status      text not null default 'pending'
              check (status in ('pending', 'sent', 'failed')),
  attempts    int  not null default 0,
  error       text,

  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

comment on table email_outbox is
  'Um email a enviar por linha, e o histórico do que já saiu. O gatilho '
  'escreve, a função agendada envia. Guarda nome e referência em texto para '
  'sobreviver ao apagamento do card.';

create index if not exists email_outbox_pending_idx
  on email_outbox (created_at) where status = 'pending';

create index if not exists email_outbox_card_idx on email_outbox (card_id);
create index if not exists email_outbox_client_idx on email_outbox (client_id, created_at desc);

-- Uma etapa avisa uma vez. Se o card voltar para trás e andar de novo, o
-- cliente não recebe a mesma mensagem duas vezes — o índice recusa.
create unique index if not exists email_outbox_stage_once
  on email_outbox (card_id, kind) where kind like 'stage:%';

alter table email_outbox enable row level security;

-- Só a Redantex lê a fila. Para o fornecedor ela não existe: diria para quem
-- a Redantex vende e quando.
create policy "Redantex reads the outbox" on email_outbox
  for select using (current_user_is_redantex());

-- Ninguém escreve pela API. Quem enfileira é o gatilho; quem marca como
-- enviado é a função, que usa a service role e passa por cima do RLS.
-- Sem política de insert ou update, qualquer tentativa pelo cliente falha.

-- As etapas que interessam ao cliente. As três do começo — PI Requested, PI
-- In Preparation, PI Approved — são a Redantex acertando a proforma com a
-- fábrica: o cliente não tem o que fazer com elas, e cada uma mostraria que
-- a fábrica ainda não confirmou.
create or replace function enqueue_client_stage_email()
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
  if new.status is not distinct from old.status then return new; end if;
  if new.archived then return new; end if;
  if new.status not in ('Placed', 'In Production', 'Ready to Ship',
                        'Collected', 'Shipped', 'Arrived') then
    return new;
  end if;

  select btrim(c.email), c.name into destino, nome
    from clients c where c.id = new.client_id;

  -- Sem endereço não há o que enfileirar. O card já avisa em âmbar que
  -- aquele cliente não pode ser notificado.
  if destino is null or destino = '' then return new; end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind)
  values (new.id, new.client_id, new.ref_number, nome, destino, 'stage:' || new.status)
  on conflict do nothing;

  return new;
exception when others then
  -- Mesma disciplina dos outros gatilhos do hub: um aviso que falha não pode
  -- ser o motivo de o card não salvar.
  raise warning 'enqueue_client_stage_email falhou no card %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_client_stage_email on cards;
create trigger trg_enqueue_client_stage_email
  after update on cards
  for each row execute function enqueue_client_stage_email();

-- Quem está em silêncio há tempo demais.
--
-- O lembrete só existe para o pedido de que ninguém falou: se a etapa mudou
-- nos últimos `dias`, o cliente já foi avisado e receber um "nada mudou" em
-- cima seria ruído. Pedido que já chegou ou se perdeu sai da conta.
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
          and o.created_at > now() - make_interval(days => dias)
     )
$$;

comment on function orders_needing_reminder is
  'Pedidos abertos de que o cliente não ouve falar há N dias. A conta olha '
  'a fila, não a etapa: qualquer email enviado naquele período já quebra o '
  'silêncio.';
