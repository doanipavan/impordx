-- Os dois avisos que faltavam nas pontas.
--
-- O cliente começava a ser informado só quando o pedido era colocado. Mas a
-- história dele começa antes, na aprovação da amostra — é dali que o relógio
-- dos 120 dias conta. E terminava com um buraco: o gatilho de mudança de data
-- ignora de propósito a passagem de vazio para o primeiro valor, senão todo
-- pedido novo geraria um aviso. Sem estes dois, o cliente receberia a
-- estimativa grossa do plano e nunca saberia quando ela virou data de
-- verdade.

-- Um por card, como as etapas. Amostra se aprova uma vez; a primeira data só
-- é primeira uma vez.
create unique index if not exists email_outbox_once_per_card
  on email_outbox (card_id, kind)
  where kind in ('sample-approved', 'date-confirmed');

-- A amostra aprovada. Mesma condição que `stamp_sample_approved` usa para
-- carimbar a data — nenhum outro quadro tem o status 'Approved'.
create or replace function enqueue_client_sample_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  destino text;
  nome    text;
begin
  if new.board <> 'samples' then return new; end if;
  if new.archived then return new; end if;
  if new.status <> 'Approved' then return new; end if;
  if coalesce(old.status, '') = 'Approved' then return new; end if;

  select btrim(c.email), c.name into destino, nome
    from clients c where c.id = new.client_id;
  if destino is null or destino = '' then return new; end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind)
  values (new.id, new.client_id, new.ref_number, nome, destino, 'sample-approved')
  on conflict do nothing;

  return new;
exception when others then
  raise warning 'enqueue_client_sample_approved falhou no card %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_client_sample_approved on cards;
create trigger trg_enqueue_client_sample_approved
  after update on cards
  for each row execute function enqueue_client_sample_approved();

-- A primeira data que a fábrica informa.
--
-- Só vale se o cliente já souber que o pedido existe: antes de Placed ele
-- nunca ouviu falar em prazo nenhum, e o email de Placed já carregaria a
-- data. Dos pedidos abertos hoje, uns recebem a data antes de serem
-- colocados e outros depois — este gatilho cobre o segundo caso, que é o
-- único em que o cliente ficaria sem saber.
create or replace function enqueue_client_first_date()
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
  if new.delivery_date is null then return new; end if;
  if old.delivery_date is not null then return new; end if;
  if new.status not in ('Placed', 'In Production', 'Ready to Ship',
                        'Collected', 'Shipped') then
    return new;
  end if;

  select btrim(c.email), c.name into destino, nome
    from clients c where c.id = new.client_id;
  if destino is null or destino = '' then return new; end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind)
  values (new.id, new.client_id, new.ref_number, nome, destino, 'date-confirmed')
  on conflict do nothing;

  return new;
exception when others then
  raise warning 'enqueue_client_first_date falhou no card %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_client_first_date on cards;
create trigger trg_enqueue_client_first_date
  after update on cards
  for each row execute function enqueue_client_first_date();
