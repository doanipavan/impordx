-- Notificações: três buracos, encontrados investigando uma queixa diferente.
--
-- Doani notou que só recebia aviso quando trabalhava em Samples. Os números
-- mostram que os avisos são criados nos três boards — o que ele viu foi um
-- efeito de quem age: nos pedidos ele mesmo move os cards, e o gatilho não
-- avisa quem fez a ação. Isso está correto.
--
-- Mas procurar a causa expôs três coisas que não estão:

-- ============================================================================
-- 1. O fornecedor nunca esteve na lista de quem é avisado
-- ============================================================================
-- Os dois gatilhos montam os destinatários a partir de: quem criou o card, o
-- vendedor, o gerente de projeto e quem já comentou. O fornecedor não aparece.
--
-- Ele só é alcançado pela porta dos fundos — tendo comentado antes. Medido nos
-- 33 cards vivos: a Ashley foi avisada em 26, e nos 26 ela já havia comentado.
-- No único card em que nunca comentou, nunca foi avisada. Zero exceções.
--
-- Para o Carlos isso é pior do que um incômodo: ele não comentou em nada, logo
-- não receberia notificação nenhuma, nunca, até comentar por conta própria em
-- algum card que ele teria de encontrar sozinho.

-- ============================================================================
-- 2. A primeira data de entrega não avisava ninguém
-- ============================================================================
-- A migração 030 avisa quando uma data JÁ PROMETIDA muda. A primeira data —
-- aquela com que a Redantex responde ao cliente — entrava em silêncio.
-- `delivery_change` tem zero linhas até hoje, o que confirma: o único caminho
-- que existia nunca foi percorrido.

-- ============================================================================
-- 3. Anexos não avisavam nada
-- ============================================================================
-- A tabela `attachments` não tinha gatilho nenhum. Subir a proforma ou a arte
-- não produzia sinal algum — exatamente o que Doani pediu que passasse a
-- avisar.

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array['comment', 'status_change', 'assignment', 'mention',
                           'due_soon', 'delivery_change', 'delivery_set',
                           'attachment']));

-- Quem é o fornecedor deste card, como pessoas.
-- `security definer` porque os gatilhos rodam sob a sessão de quem agiu, e um
-- fornecedor não enxerga a linha do outro em `users` (migração 031).
create or replace function card_supplier_users(p_card_id uuid)
returns table (id uuid)
language sql stable security definer set search_path = public as $$
  select u.id
    from users u
    join cards c on c.id = p_card_id
   where u.role = 'viewer'
     and u.supplier_id is not null
     and u.supplier_id = c.supplier_id
$$;

revoke execute on function card_supplier_users(uuid) from public, anon;
grant execute on function card_supplier_users(uuid) to authenticated;

-- ============================================================================
-- Mudança de status
-- ============================================================================
create or replace function notify_on_status_change()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor text;
  v_actor_id uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  select u.full_name into v_actor from users u where u.id = v_actor_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.id, v_actor_id, 'status_change',
         coalesce(v_actor,'Someone') || ' moved "' || coalesce(new.title,'a card') || '" to ' || new.status
    from (
      select c.created_by         as p from cards c where c.id = new.id
      union select c.salesperson_id     from cards c where c.id = new.id
      union select c.project_manager_id from cards c where c.id = new.id
      union select cm.user_id           from comments cm where cm.card_id = new.id
      -- Purchasing e Commercial são a entrada interna da Redantex: o fornecedor
      -- não vê essas colunas no quadro dele, e avisá-lo de uma etapa que ele
      -- não consegue encontrar é ruído — e conta mais do que ele deve saber.
      union select s.id from card_supplier_users(new.id) s
             where new.status not in ('Purchasing', 'Commercial')
    ) participants
   where p is not null and (v_actor_id is null or p <> v_actor_id);

  return new;
exception when others then
  raise warning 'notify_on_status_change failed for card %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- ============================================================================
-- Comentários
-- ============================================================================
-- Aqui sem filtro de etapa: um comentário é um ato deliberado de falar com
-- alguém, e o card abre pelo link do aviso mesmo que não esteja numa coluna
-- visível no quadro.
-- Cópia literal da função em produção, com UMA linha acrescentada: o fornecedor
-- entra na lista. A lógica de menções, o texto das mensagens e a ordem dos dois
-- inserts ficam exatamente como estavam — reescrevê-los seria arriscar quebrar
-- as menções para consertar outra coisa.
create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor text;
  v_title text;
  v_mentioned uuid[] := '{}';
begin
  select u.full_name into v_actor from users u where u.id = new.user_id;
  select c.title into v_title from cards c where c.id = new.card_id;

  select coalesce(array_agg(distinct u.id), '{}') into v_mentioned
    from users u
   where u.full_name in (select (regexp_matches(new.body, '@\[([^\]]+)\]', 'g'))[1]);

  insert into notifications (user_id, card_id, actor_id, type, message)
  select m, new.card_id, new.user_id, 'mention',
         coalesce(v_actor,'Someone') || ' mentioned you in "' || coalesce(v_title,'a card') || '"'
    from unnest(v_mentioned) as m where m <> new.user_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.card_id, new.user_id, 'comment',
         coalesce(v_actor,'Someone') || ' commented on "' || coalesce(v_title,'a card') || '"'
    from (
      select c.created_by         as p from cards c where c.id = new.card_id
      union select c.salesperson_id     from cards c where c.id = new.card_id
      union select c.project_manager_id from cards c where c.id = new.card_id
      union select cm.user_id           from comments cm where cm.card_id = new.card_id
      union select s.id from card_supplier_users(new.card_id) s
    ) participants
   where p is not null and p <> new.user_id and not (p = any(v_mentioned));

  return new;
exception when others then
  raise warning 'notify_on_comment failed for comment %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- ============================================================================
-- A data de entrega: informar também é notícia, não só mudar
-- ============================================================================
create or replace function guard_delivery_date()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_name   text;
  v_reason text := nullif(btrim(coalesce(new.delivery_date_change_reason, '')), '');
begin
  if new.delivery_date is not distinct from old.delivery_date then
    return new;
  end if;

  -- Primeira data: é a promessa. Não há o que alertar — mas é exatamente a
  -- informação que a Redantex estava esperando para responder ao cliente, e
  -- até agora ela chegava sem que ninguém fosse avisado.
  if old.delivery_date is null then
    new.delivery_date_promised := new.delivery_date;
    new.delivery_date_changed_at := null;
    new.delivery_date_change_reason := null;

    select full_name into v_name from users where id = v_actor;

    insert into notifications (user_id, card_id, actor_id, type, message)
    select distinct p, new.id, v_actor, 'delivery_set',
           coalesce(v_name, 'The supplier') || ' gave the delivery date for "'
             || coalesce(new.title, 'an order') || '": ' || to_char(new.delivery_date, 'DD Mon YYYY')
      from (
        select u.id as p from users u where u.alert_delivery_changes
        union select c.created_by         from cards c where c.id = new.id
        union select c.salesperson_id     from cards c where c.id = new.id
        union select c.project_manager_id from cards c where c.id = new.id
      ) destinatarios
     where p is not null and (v_actor is null or p <> v_actor);

    return new;
  end if;

  if new.delivery_date is null then
    raise exception 'The delivery date is already committed — replace it with a new date rather than clearing it';
  end if;

  if v_reason is null then
    raise exception 'Changing a committed delivery date needs a reason — say what happened';
  end if;

  new.delivery_date_changed_at := now();
  new.delivery_date_change_reason := v_reason;

  select full_name into v_name from users where id = v_actor;

  -- A mudança agora alcança também os donos do card, não só a lista global.
  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.id, v_actor, 'delivery_change',
         coalesce(v_name, 'The supplier') || ' moved the delivery date of "'
           || coalesce(new.title, 'an order') || '" from '
           || to_char(old.delivery_date, 'DD Mon') || ' to '
           || to_char(new.delivery_date, 'DD Mon')
           || ' — ' || v_reason
    from (
      select u.id as p from users u where u.alert_delivery_changes
      union select c.created_by         from cards c where c.id = new.id
      union select c.salesperson_id     from cards c where c.id = new.id
      union select c.project_manager_id from cards c where c.id = new.id
    ) destinatarios
   where p is not null and (v_actor is null or p <> v_actor);

  insert into activity_logs (card_id, user_id, action, old_value, new_value)
  values (new.id, v_actor, 'delivery_date_changed',
          old.delivery_date::text, new.delivery_date::text || ' — ' || v_reason);

  return new;
end;
$$;

-- ============================================================================
-- Anexos: a proforma e a arte
-- ============================================================================
-- O nome do arquivo vai na mensagem em vez de o gatilho tentar adivinhar o que
-- ele é. "Ashley added PI-88.pdf" diz mais, e com mais honestidade, do que
-- qualquer regra que tentasse reconhecer uma proforma pelo nome.
create or replace function notify_on_attachment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_author text;
  v_title  text;
begin
  select u.full_name into v_author from users u where u.id = new.user_id;
  select c.title into v_title from cards c where c.id = new.card_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.card_id, new.user_id, 'attachment',
         coalesce(v_author,'Someone') || ' added ' || coalesce(new.filename,'a file')
           || ' to "' || coalesce(v_title,'a card') || '"'
    from (
      select c.created_by         as p from cards c where c.id = new.card_id
      union select c.salesperson_id     from cards c where c.id = new.card_id
      union select c.project_manager_id from cards c where c.id = new.card_id
      union select cm.user_id           from comments cm where cm.card_id = new.card_id
      union select s.id from card_supplier_users(new.card_id) s
    ) participants
   where p is not null and p <> new.user_id;

  return new;
-- Engole o próprio erro, pela mesma razão dos outros dois: um aviso não pode
-- ser o motivo de um upload falhar. Uploads já falharam sozinhos o bastante.
exception when others then
  raise warning 'notify_on_attachment failed for attachment %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists attachments_notify on attachments;
create trigger attachments_notify
  after insert on attachments
  for each row execute function notify_on_attachment();
