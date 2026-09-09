-- O aviso de saldo, 21 e 15 dias antes.
--
-- O saldo de 60% vence na data que a DEQI deu para a mercadoria ficar pronta.
-- Avisar no dia não serve: fechar câmbio leva tempo, e o embarque não espera.
--
-- Dois toques, não um: 21 dias para começar a providenciar, 15 para cobrar.
-- Um aviso só vira ruído se chega no dia errado; dois com intervalo dizem
-- "comece" e depois "agora é sério".

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array['comment', 'status_change', 'assignment', 'mention',
                           'due_soon', 'delivery_change', 'delivery_set',
                           'attachment', 'payment_due']));

-- Quem cuida do dinheiro. Per-person e não por papel, pela mesma razão de
-- can_return_orders e alert_delivery_changes: a Valéria é `member` como o
-- Antonio e o Patrick, e só ela precisa disto.
alter table users add column if not exists alert_payments boolean not null default false;

comment on column users.alert_payments is
  'Recebe os avisos de saldo a pagar, 21 e 15 dias antes. Deliberadamente '
  'por pessoa, não por papel.';

-- A Valéria ainda não tem conta. Quando tiver:
--   update users set alert_payments = true where email = '<o e-mail dela>';
update users set alert_payments = true where full_name in ('Doani Pavan');

-- Marca qual dos dois toques já foi dado, para não repetir todo dia.
alter table proforma_payments add column if not exists reminded_21_at timestamptz;
alter table proforma_payments add column if not exists reminded_15_at timestamptz;

create or replace function remind_payments_due()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_sent int := 0;
  p record;
  v_dias int;
begin
  for p in
    select pay.id, pay.due_date, pay.amount_usd, pf.pi_number,
           (pay.due_date - current_date) as faltam,
           pay.reminded_21_at, pay.reminded_15_at
      from proforma_payments pay
      join proformas pf on pf.id = pay.proforma_id
     where pay.tranche = 'balance'
       and pay.paid_at is null
       and pay.due_date is not null
       and (pay.due_date - current_date) between 0 and 21
  loop
    v_dias := p.faltam;

    -- 21 dias: uma vez, na primeira passagem em que a janela abre. Usa <= 21
    -- em vez de = 21 para não perder o toque se o cron falhar num dia.
    if p.reminded_21_at is null then
      insert into notifications (user_id, card_id, actor_id, type, message)
      select u.id, null, null, 'payment_due',
             'Balance of ' || p.pi_number || ' — US$ ' || p.amount_usd
               || ' due ' || to_char(p.due_date, 'DD Mon') || ' (' || v_dias || ' days)'
        from users u where u.alert_payments;
      update proforma_payments set reminded_21_at = now() where id = p.id;
      v_sent := v_sent + 1;

    elsif v_dias <= 15 and p.reminded_15_at is null then
      insert into notifications (user_id, card_id, actor_id, type, message)
      select u.id, null, null, 'payment_due',
             'Balance of ' || p.pi_number || ' — US$ ' || p.amount_usd
               || ' due ' || to_char(p.due_date, 'DD Mon') || ' in ' || v_dias || ' days'
        from users u where u.alert_payments;
      update proforma_payments set reminded_15_at = now() where id = p.id;
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
exception when others then
  -- Mesma razão dos outros gatilhos: um aviso que falha não pode derrubar o
  -- que o disparou. Mas aqui o erro é registrado, porque nada mais o veria.
  raise warning 'remind_payments_due failed: %', sqlerrm;
  return v_sent;
end;
$$;

revoke execute on function remind_payments_due() from public, anon;

-- Todo dia às 12:00 UTC — 9h em São Paulo, antes do expediente começar a
-- encher. O cron roda no banco; não depende de ninguém abrir o hub.
select cron.unschedule('payment-reminders') where exists (
  select 1 from cron.job where jobname = 'payment-reminders');

select cron.schedule('payment-reminders', '0 12 * * *', 'select remind_payments_due()');
