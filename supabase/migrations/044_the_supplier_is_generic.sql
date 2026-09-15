-- O status "Under DEQI Revision" passa a ler "Under Supplier Revision" em
-- toda mensagem do sino, para todo mundo.
--
-- O valor gravado não muda — está numa CHECK constraint e em dezenas de linhas
-- de histórico — só o que se lê. Doani decidiu (14 Sep) que o hub se refere
-- aos fornecedores genericamente: nem o nome do fornecedor do card, nem DEQI
-- por vestígio de quando só havia um. A tela já faz isso em statusLabel; o
-- banco gerava as mensagens com o valor cru, e 79 delas dizem "to Under DEQI
-- Revision". As duas funções passam por um rótulo único, e as antigas são
-- reescritas.

create or replace function status_label(p_status text)
returns text language sql immutable as $$
  select case when p_status = 'Under DEQI Revision' then 'Under Supplier Revision' else p_status end
$$;

CREATE OR REPLACE FUNCTION public.notify_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor text;
  v_actor_id uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  select u.full_name into v_actor from users u where u.id = v_actor_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.id, v_actor_id, 'status_change',
         coalesce(v_actor,'Someone') || ' moved "' || coalesce(new.title,'a card') || '" to ' || status_label(new.status)
    from (
      select c.created_by         as p from cards c where c.id = new.id
      union select c.salesperson_id     from cards c where c.id = new.id
      union select c.project_manager_id from cards c where c.id = new.id
      union select cm.user_id           from comments cm where cm.card_id = new.id
      -- Purchasing e Commercial são a entrada interna da Redantex: o fornecedor
      -- não vê essas colunas no quadro dele, e avisá-lo de uma etapa que ele
      -- não consegue encontrar é ruído — e conta mais do que ele deve saber.
      union select s.id from card_supplier_users(new.id) s
             where new.status not in ('Purchasing', 'Commercial', 'Arrived')
    ) participants
   where p is not null and (v_actor_id is null or p <> v_actor_id);

  return new;
exception when others then
  raise warning 'notify_on_status_change failed for card %: %', new.id, sqlerrm;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_sla_breaches()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int := 0;
begin
  with breached as (
    select c.id, c.title, c.status, c.project_manager_id, c.salesperson_id,
           s.short_name as supplier_name,
           business_days_since(c.status_since) as used
      from cards c left join suppliers s on s.id = c.supplier_id
     where c.board = 'samples'
       and not c.archived
       and c.status in ('Requested','In Preparation','Under RDX Revision','Under DEQI Revision')
       and c.sla_notified_at is null
       and business_days_since(c.status_since) > 2
  ),
  targets as (
    -- The side that owns the stage hears about it. DEQI stages go to the
    -- supplier; ours go to the people accountable for the card.
    -- Etapa do fornecedor: só os usuários do fornecedor DESTE card, via
    -- card_supplier_users (migração 031/033). Era `u.role = 'viewer'`, que
    -- avisaria o Carlos de um card da DEQI, com o título, na primeira vez que
    -- um SLA estourasse numa etapa deles. Nunca chegou a acontecer.
    select b.id as card_id, b.title, b.status, b.supplier_name, b.used, u.id as user_id
      from breached b
      join users u on (
        case
          when b.status in ('In Preparation','Under DEQI Revision')
            then u.id in (select s.id from card_supplier_users(b.id) s)
          else u.id in (b.project_manager_id, b.salesperson_id)
        end
      )
  ),
  inserted as (
    insert into notifications (user_id, card_id, actor_id, type, message)
    select t.user_id, t.card_id, null, 'due_soon',
           'SLA passed on "' || t.title || '" — ' || t.used || ' business days in '
             -- o valor gravado é 'Under DEQI Revision' de quando só havia um
             -- fornecedor; na tela vira 'Under <fornecedor> Revision' (statusLabel),
             -- e aqui tem de virar o mesmo, senão o sino conta o que a tela esconde
             || status_label(t.status)
      from targets t
    returning card_id
  )
  select count(distinct card_id) into v_count from inserted;

  update cards set sla_notified_at = now()
   where id in (select id from cards c
                 where c.board='samples' and not c.archived
                   and c.sla_notified_at is null
                   and business_days_since(c.status_since) > 2
                   and c.status in ('Requested','In Preparation','Under RDX Revision','Under DEQI Revision'));

  return v_count;
end;
$function$;

-- as mensagens já enviadas: a mesma troca, sem tocar em mais nada do texto
update notifications
   set message = replace(message, 'Under DEQI Revision', 'Under Supplier Revision')
 where message like '%Under DEQI Revision%';
