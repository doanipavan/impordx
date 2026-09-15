-- O aviso de SLA não pode vazar entre fornecedores.
--
-- notify_sla_breaches (pg_cron, dias úteis 12:00 UTC) tinha dois restos de
-- quando havia um fornecedor só:
--
--   1. Nas etapas do fornecedor, avisava `u.role = 'viewer'` — todo viewer,
--      de qualquer fornecedor. O Carlos (Sconcept) receberia aviso de um card
--      da DEQI, com o título. Nunca aconteceu: até hoje o SLA só estourou em
--      etapas da Redantex. Agora é card_supplier_users(card), como as outras
--      notificações desde a 033.
--
--   2. A mensagem colava o status cru: "… business days in Under DEQI
--      Revision". A tela traduz esse valor para "Under <fornecedor> Revision"
--      (statusLabel); o sino tem de dizer o mesmo.
--
-- Fonte copiada do banco em 14 Sep 2026, três trechos alterados.

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
             || case when t.status = 'Under DEQI Revision'
                     then 'Under ' || coalesce(t.supplier_name, 'Supplier') || ' Revision'
                     else t.status end
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
