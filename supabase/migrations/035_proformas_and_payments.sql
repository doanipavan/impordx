-- O financeiro: a proforma como unidade de dinheiro.
--
-- O hub sabia quanto uma peça custa e por quanto vende, e nada sobre dinheiro
-- se movendo. Não havia registro de pagamento, câmbio ou vencimento.
--
-- A proforma é a unidade, não o card: a DEQI consolida vários pedidos numa
-- fatura só — três das dez cobrem quatro cards cada, e uma delas junta quatro
-- clientes diferentes. Um pagamento seu cobre mercadoria de todos eles, e é
-- assim que ele aparece no extrato. Modelar pagamento por card produziria um
-- número que não bate com o banco.

create table if not exists proformas (
  id           uuid primary key default uuid_generate_v4(),
  pi_number    text not null,
  supplier_id  uuid references suppliers(id),
  -- Quem recebe o documento da DEQI declara que ela parou de crescer. Sem isto
  -- o sinal seria cobrado sobre um valor que ainda muda: os cards de uma mesma
  -- proforma viram Placed em dias diferentes — dez dias de diferença na
  -- YUQ508-1322392 — e dois deles ainda estão em PI In Preparation.
  closed_at    timestamptz,
  closed_by    uuid references users(id),
  created_at   timestamptz not null default now()
);

create unique index if not exists proformas_pi_number_key on proformas(lower(pi_number));

comment on table proformas is
  'A fatura que a DEQI emite, e a unidade em que o dinheiro se move. Os cards '
  'que ela cobre são os que carregam este pi_number.';

-- As dez que já existem, tiradas dos próprios cards.
insert into proformas (pi_number, supplier_id)
select distinct on (lower(c.pi_number)) btrim(c.pi_number), c.supplier_id
  from cards c
 where c.board = 'orders'
   and nullif(btrim(coalesce(c.pi_number, '')), '') is not null
   and not exists (select 1 from proformas p where lower(p.pi_number) = lower(btrim(c.pi_number)))
 order by lower(c.pi_number), c.created_at;

-- =====================================================================
-- Pagamentos
-- =====================================================================
-- Duas parcelas por proforma: 40% de sinal e 60% de saldo. O previsto é conta;
-- o realizado é o que a Valéria digita depois de fechar câmbio.

create table if not exists proforma_payments (
  id            uuid primary key default uuid_generate_v4(),
  proforma_id   uuid not null references proformas(id) on delete cascade,
  tranche       text not null check (tranche in ('deposit', 'balance')),

  -- Previsto
  share         numeric(5,4) not null,   -- 0.4000 / 0.6000
  due_date      date,

  -- Realizado. O valor em real e a taxa são digitados porque o câmbio é
  -- fechado fora daqui, e as duas parcelas saem por caminhos diferentes com
  -- taxas diferentes — sem registrar as duas, o custo real em reais some.
  paid_at       date,
  amount_usd    numeric(12,2),
  amount_brl    numeric(14,2),
  fx_rate       numeric(10,4),
  channel       text check (channel in ('bank', 'other')),
  note          text,

  recorded_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (proforma_id, tranche)
);

create index if not exists proforma_payments_due_idx on proforma_payments(due_date) where paid_at is null;

comment on column proforma_payments.fx_rate is
  'A taxa do fechamento, digitada. As duas parcelas fecham por caminhos '
  'diferentes e a taxa não é a mesma; é a diferença entre elas que mostra o '
  'custo real da proforma em reais.';

-- =====================================================================
-- Quem vê
-- =====================================================================
-- Só a Redantex. O fornecedor não vê que a tabela existe — não é o preço de
-- venda que está aqui, é o caixa da empresa.

alter table proformas enable row level security;
alter table proforma_payments enable row level security;

drop policy if exists "Redantex reads proformas" on proformas;
create policy "Redantex reads proformas"
  on proformas for select to authenticated using (current_user_is_redantex());

drop policy if exists "Redantex writes proformas" on proformas;
create policy "Redantex writes proformas"
  on proformas for all to authenticated
  using (current_user_is_redantex()) with check (current_user_is_redantex());

drop policy if exists "Redantex reads payments" on proforma_payments;
create policy "Redantex reads payments"
  on proforma_payments for select to authenticated using (current_user_is_redantex());

drop policy if exists "Redantex writes payments" on proforma_payments;
create policy "Redantex writes payments"
  on proforma_payments for all to authenticated
  using (current_user_is_redantex()) with check (current_user_is_redantex());

-- =====================================================================
-- Fechar a proforma cria as duas parcelas
-- =====================================================================
-- 40% vence ao fechar. 60% vence na data que a DEQI deu para ficar pronto —
-- a mais próxima entre os cards daquela proforma, porque eles embarcam juntos.

create or replace function close_proforma(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pi     text;
  v_total  numeric;
  v_ready  date;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can close a proforma';
  end if;

  select pi_number into v_pi from proformas where id = p_id;
  if v_pi is null then raise exception 'Proforma not found'; end if;

  select coalesce(sum(i.quantity * i.unit_price_usd), 0), min(c.delivery_date)
    into v_total, v_ready
    from cards c
    join card_items i on i.card_id = c.id
   where lower(btrim(coalesce(c.pi_number, ''))) = lower(v_pi)
     and coalesce(c.archived, false) = false;

  if v_total <= 0 then
    raise exception 'This proforma has no priced items yet';
  end if;

  update proformas set closed_at = now(), closed_by = auth.uid() where id = p_id;

  insert into proforma_payments (proforma_id, tranche, share, due_date, amount_usd)
  values (p_id, 'deposit', 0.4000, current_date,       round(v_total * 0.4, 2)),
         (p_id, 'balance', 0.6000, v_ready,            round(v_total * 0.6, 2))
  on conflict (proforma_id, tranche) do update
    set due_date = excluded.due_date,
        amount_usd = excluded.amount_usd
  where proforma_payments.paid_at is null;   -- nunca reescreve o que já foi pago
end;
$$;

revoke execute on function close_proforma(uuid) from public, anon;
grant execute on function close_proforma(uuid) to authenticated;
