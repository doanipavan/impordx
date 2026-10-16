-- O que o provedor devolve passa a ser ouvido.
--
-- Até aqui o hub mandava e dava a conversa por encerrada: a linha virava
-- "enviado" e ninguém nunca soubera se chegou. Um endereço com erro de
-- digitação ficava marcado como enviado para sempre — o hub dizendo que
-- avisou, o cliente nunca tendo recebido, e o vendedor acreditando que o
-- assunto estava resolvido. Com 46 endereços ainda por digitar, era uma
-- questão de quando.
--
-- Três coisas mudam:
--
--   **Guarda-se o identificador do provedor** (`provider_id`), que é a única
--   forma de casar um evento que chega depois com a linha que o originou.
--
--   **Entrega e devolução passam a ser fatos registrados**, não suposições.
--
--   **Endereço que devolveu de vez para de ser usado.** Sem isso, o lembrete
--   de quinze dias continuaria escrevendo para uma caixa que não existe, para
--   sempre, e a fila encheria de falhas idênticas.

alter table email_outbox add column if not exists provider_id   text;
alter table email_outbox add column if not exists delivered_at  timestamptz;
alter table email_outbox add column if not exists bounced_at    timestamptz;
alter table email_outbox add column if not exists bounce_detail text;

comment on column email_outbox.provider_id is
  'O id que a Resend devolve no envio. Sem ele não há como casar o evento '
  'que chega depois com esta linha.';
comment on column email_outbox.delivered_at is
  '"Enviado" é o que o hub fez; "entregue" é o que aconteceu. São coisas '
  'diferentes e agora ficam separadas.';

create index if not exists email_outbox_provider on email_outbox (provider_id)
  where provider_id is not null;

-- ---------------------------------------------------------------------------
-- O endereço que devolveu
-- ---------------------------------------------------------------------------

alter table clients add column if not exists bounced_at    timestamptz;
alter table clients add column if not exists bounce_detail text;

comment on column clients.bounced_at is
  'Marcado quando o endereço devolve de forma permanente. Enquanto estiver '
  'preenchido, nenhum aviso sai para este cliente — e salvar o endereço de '
  'novo limpa a marca, porque corrigir é dizer "pode tentar outra vez".';

-- Endereço devolvido sai da conta do lembrete. A verificação na hora do envio
-- é a que de fato protege; esta evita encher a fila de linhas que já se sabe
-- que vão falhar.
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
     and cl.bounced_at is null
     and not exists (
       select 1 from email_outbox o
        where o.card_id = c.id
          and o.status in ('pending', 'sent')
          and not o.preview
          and o.created_at > now() - make_interval(days => dias)
     )
$$;

-- ---------------------------------------------------------------------------
-- O que o webhook chama
-- ---------------------------------------------------------------------------

/*
 * Registra um evento do provedor.
 *
 * `security definer` porque quem chama é a função do Netlify com a chave de
 * serviço — mas a conferência da assinatura acontece lá, antes daqui. Esta
 * função não confia em quem a chama: só casa por `provider_id` e, se não
 * achar, não faz nada. Um id inventado não marca nada de ninguém.
 */
create or replace function record_email_event(
  p_provider_id text,
  p_event       text,
  p_detail      text default null,
  p_permanent   boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo email_outbox%rowtype;
begin
  select * into alvo from email_outbox where provider_id = p_provider_id;
  if alvo.id is null then return false; end if;

  if p_event = 'delivered' then
    update email_outbox set delivered_at = now() where id = alvo.id;

  elsif p_event = 'bounced' then
    update email_outbox
       set bounced_at = now(), bounce_detail = left(coalesce(p_detail, ''), 400)
     where id = alvo.id;

    -- Só devolução permanente cala o endereço. Caixa cheia e servidor fora do
    -- ar voltam sozinhos; tratar os dois igual apagaria um cliente bom por
    -- causa de uma tarde ruim do provedor dele.
    if p_permanent and alvo.client_id is not null and not alvo.preview then
      update clients
         set bounced_at = now(), bounce_detail = left(coalesce(p_detail, ''), 400)
       where id = alvo.client_id and bounced_at is null;
    end if;

  elsif p_event = 'complained' then
    -- Marcar como spam é um pedido para parar, e é tratado como tal.
    update email_outbox
       set bounced_at = now(),
           bounce_detail = left('marcado como spam pelo destinatário. ' || coalesce(p_detail, ''), 400)
     where id = alvo.id;
    if alvo.client_id is not null and not alvo.preview then
      update clients
         set bounced_at = now(),
             bounce_detail = 'o destinatário marcou um aviso como spam'
       where id = alvo.client_id and bounced_at is null;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function record_email_event(text, text, text, boolean) from public, anon, authenticated;
grant execute on function record_email_event(text, text, text, boolean) to service_role;
