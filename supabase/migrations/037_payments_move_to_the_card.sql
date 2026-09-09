-- O pagamento passa a ser do card, não da proforma.
--
-- A 035 modelou a proforma como unidade porque é assim que a remessa aparece no
-- extrato. Vendo a tela pronta, Doani escolheu o contrário: cada pedido tem o
-- seu próprio 40/60, e é fechado individualmente.
--
-- O motivo está visível nos dados: a YUQ508-1322662 tem três cards em Placed e
-- um ainda em PI In Preparation. Fechar a proforma inteira cobraria por um
-- pedido que ainda não é pedido. Fechando card a card, cada um entra quando
-- vira real.
--
-- O custo dessa escolha, registrado para quem ler depois: uma remessa ao
-- fornecedor cobre vários cards, então o extrato do banco não bate linha a
-- linha com esta tabela. A conciliação passa a ser somar os cards de uma
-- proforma — que é o que a tela agrupa.
--
-- Nada foi gravado ainda (zero pagamentos, nenhuma proforma fechada), então a
-- troca é limpa em vez de uma migração de dados.

drop function if exists close_proforma(uuid);
drop table if exists proforma_payments;
-- A tabela de proformas existia só para guardar "fechada em". Com o fecho no
-- card, ela não guarda mais nada: o agrupamento sai do pi_number que os cards
-- já carregam. Uma tabela que não significa nada é pior que nenhuma.
drop table if exists proformas;

create table if not exists card_payments (
  id          uuid primary key default uuid_generate_v4(),
  card_id     uuid not null references cards(id) on delete cascade,
  tranche     text not null check (tranche in ('deposit', 'balance')),

  -- Previsto
  share       numeric(5,4) not null,
  due_date    date,
  amount_usd  numeric(12,2),

  -- Realizado. Digitado porque o câmbio fecha fora do hub, e as duas parcelas
  -- saem por caminhos diferentes a taxas diferentes — sem as duas, o custo
  -- real em reais não existe em lugar nenhum.
  paid_at     date,
  amount_brl  numeric(14,2),
  fx_rate     numeric(10,4),
  channel     text check (channel in ('bank', 'other')),
  note        text,

  closed_by   uuid references users(id),
  recorded_by uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 21 e 15 dias antes, uma vez cada.
  reminded_21_at timestamptz,
  reminded_15_at timestamptz,

  unique (card_id, tranche)
);

create index if not exists card_payments_due_idx on card_payments(due_date) where paid_at is null;

comment on table card_payments is
  'As duas parcelas de um pedido: 40% ao fechar, 60% na data que o fornecedor '
  'deu para ficar pronto. Uma remessa ao fornecedor cobre vários cards — a '
  'conciliação com o banco é a soma dos cards de uma mesma proforma.';

alter table card_payments enable row level security;

drop policy if exists "Redantex reads card payments" on card_payments;
create policy "Redantex reads card payments"
  on card_payments for select to authenticated using (current_user_is_redantex());

drop policy if exists "Redantex writes card payments" on card_payments;
create policy "Redantex writes card payments"
  on card_payments for all to authenticated
  using (current_user_is_redantex()) with check (current_user_is_redantex());

-- =====================================================================
-- Fechar um card cria as duas parcelas dele
-- =====================================================================

create or replace function close_card_payment(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_ready date;
  v_board text;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can close an order for payment';
  end if;

  select c.board, c.delivery_date into v_board, v_ready from cards c where c.id = p_card_id;
  if v_board is null then raise exception 'Order not found'; end if;
  if v_board <> 'orders' then raise exception 'Only an order can be closed for payment'; end if;

  select coalesce(sum(i.quantity * i.unit_price_usd), 0) into v_total
    from card_items i where i.card_id = p_card_id;

  if v_total <= 0 then
    raise exception 'This order has no priced items yet';
  end if;

  insert into card_payments (card_id, tranche, share, due_date, amount_usd, closed_by)
  values (p_card_id, 'deposit', 0.4000, current_date, round(v_total * 0.4, 2), auth.uid()),
         (p_card_id, 'balance', 0.6000, v_ready,      round(v_total * 0.6, 2), auth.uid())
  on conflict (card_id, tranche) do update
    set due_date   = excluded.due_date,
        amount_usd = excluded.amount_usd
  where card_payments.paid_at is null;   -- nunca reescreve o que já foi pago
end;
$$;

revoke execute on function close_card_payment(uuid) from public, anon;
grant execute on function close_card_payment(uuid) to authenticated;

-- =====================================================================
-- O lembrete, agora por card
-- =====================================================================

create or replace function remind_payments_due()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_sent int := 0;
  p record;
  v_dias int;
begin
  for p in
    select pay.id, pay.due_date, pay.amount_usd, pay.reminded_21_at, pay.reminded_15_at,
           c.id as card_id, coalesce(c.ref_number, c.title) as label,
           (pay.due_date - current_date) as faltam
      from card_payments pay
      join cards c on c.id = pay.card_id
     where pay.tranche = 'balance'
       and pay.paid_at is null
       and pay.due_date is not null
       and (pay.due_date - current_date) between 0 and 21
  loop
    v_dias := p.faltam;

    if p.reminded_21_at is null then
      insert into notifications (user_id, card_id, actor_id, type, message)
      select u.id, p.card_id, null, 'payment_due',
             'Balance of ' || p.label || ' — US$ ' || p.amount_usd
               || ' due ' || to_char(p.due_date, 'DD Mon') || ' (' || v_dias || ' days)'
        from users u where u.alert_payments;
      update card_payments set reminded_21_at = now() where id = p.id;
      v_sent := v_sent + 1;

    elsif v_dias <= 15 and p.reminded_15_at is null then
      insert into notifications (user_id, card_id, actor_id, type, message)
      select u.id, p.card_id, null, 'payment_due',
             'Balance of ' || p.label || ' — US$ ' || p.amount_usd
               || ' due ' || to_char(p.due_date, 'DD Mon') || ' in ' || v_dias || ' days'
        from users u where u.alert_payments;
      update card_payments set reminded_15_at = now() where id = p.id;
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
exception when others then
  raise warning 'remind_payments_due failed: %', sqlerrm;
  return v_sent;
end;
$$;

revoke execute on function remind_payments_due() from public, anon;
