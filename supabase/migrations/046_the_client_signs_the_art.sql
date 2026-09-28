-- 046 · O cliente assina a arte
--
-- Decidido 28 set 2026. Um link por arte, sem conta: a Redantex escolhe os
-- arquivos, o hub devolve um endereço secreto, e quem abre vê a arte, o Termo
-- de Aprovação e dois botões. Assinou, acabou — o link morre.
--
-- Três regras moldam o desenho:
--
-- 1. O link não é uma janela para o card. A função devolve só os campos
--    escolhidos: referência, título, cliente, os arquivos marcados e (se
--    pedido) a ficha. Preço, fornecedor, datas e qualquer outro card ficam
--    fora do que a função sequer lê.
-- 2. O token nunca é guardado. Fica só o sha256 dele; quem abrir o banco não
--    consegue assinar no lugar de ninguém.
-- 3. Assinar é um ato registrado: nome, e-mail, quando, de onde, e o retrato
--    exato do que estava na tela, com hash. É o que sustenta o aceite depois.

create table if not exists approval_requests (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references cards(id) on delete cascade,
  -- sha256 do token em hex. O token em claro existe uma vez, na resposta da
  -- função que o criou, e nunca volta.
  token_hash    text not null unique,
  attachment_ids uuid[] not null check (array_length(attachment_ids, 1) between 1 and 10),
  include_specs boolean not null default false,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  signed_at     timestamptz
);

create index if not exists approval_requests_card on approval_requests(card_id, created_at desc);

create table if not exists approval_signatures (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references approval_requests(id) on delete cascade,
  decision      text not null check (decision in ('approved', 'changes')),
  signer_name   text not null,
  signer_email  text not null,
  accepted_terms boolean not null default false,
  note          text,
  signed_at     timestamptz not null default now(),
  ip            text,
  user_agent    text,
  -- O que estava na tela, palavra por palavra, e o hash disso.
  snapshot      jsonb not null,
  snapshot_hash text not null
);

create index if not exists approval_signatures_request on approval_signatures(request_id);

-- Quem assinou pelo cliente, na própria peça — é o que vira selo no card.
alter table cards add column if not exists client_approved_at timestamptz;
alter table cards add column if not exists client_approved_by text;

alter table approval_requests enable row level security;
alter table approval_signatures enable row level security;

-- Só a Redantex lê. O cliente nunca chega por aqui: ele passa pelas funções
-- abaixo, que são security definer e não entregam a tabela.
drop policy if exists "Redantex reads approval requests" on approval_requests;
create policy "Redantex reads approval requests" on approval_requests
  for select to authenticated using (current_user_is_redantex());

drop policy if exists "Redantex reads signatures" on approval_signatures;
create policy "Redantex reads signatures" on approval_signatures
  for select to authenticated using (current_user_is_redantex());

-- O sino aceita dois avisos novos. O CHECK precisa ser refeito inteiro: é a
-- mesma armadilha do status 'Arrived' na migração 042.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array['comment', 'status_change', 'assignment', 'mention', 'due_soon',
                           'delivery_change', 'delivery_set', 'attachment', 'payment_due',
                           'client_approved', 'client_changes']));

-- ── criar o link ────────────────────────────────────────────────────────────

create or replace function approval_create(
  p_card uuid,
  p_attachments uuid[],
  p_include_specs boolean default false,
  p_days int default 30
) returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
  v_bad int;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can send an approval link';
  end if;
  if p_attachments is null or array_length(p_attachments, 1) is null then
    raise exception 'Pick at least one file';
  end if;

  -- Todo arquivo tem de ser deste card. Sem isto, um id de outro card viajaria
  -- no link e a página o mostraria sem perguntar de quem era.
  select count(*) into v_bad
    from unnest(p_attachments) a(id)
   where not exists (select 1 from attachments t where t.id = a.id and t.card_id = p_card);
  if v_bad > 0 then
    raise exception 'Every file must belong to this card';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into approval_requests (card_id, token_hash, attachment_ids, include_specs, created_by, expires_at)
  values (p_card, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_attachments, coalesce(p_include_specs, false),
          auth.uid(), now() + make_interval(days => greatest(p_days, 1)));

  insert into activity_logs (card_id, user_id, action, new_value)
  values (p_card, auth.uid(), 'approval_sent', array_length(p_attachments, 1)::text || ' file(s)');

  token := v_token;
  expires_at := now() + make_interval(days => greatest(p_days, 1));
  return next;
end;
$$;

revoke all on function approval_create(uuid, uuid[], boolean, int) from public, anon;
grant execute on function approval_create(uuid, uuid[], boolean, int) to authenticated;

-- ── o que o cliente vê ──────────────────────────────────────────────────────
--
-- Whitelist explícita. Um `select c.*` aqui entregaria value_brl junto.

create or replace function approval_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r approval_requests;
  c cards;
  v_files jsonb;
  v_specs jsonb := null;
  v_sig approval_signatures;
begin
  select * into r from approval_requests
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if r.id is null then
    return jsonb_build_object('state', 'unknown');
  end if;
  if r.revoked_at is not null then
    return jsonb_build_object('state', 'revoked');
  end if;
  if r.expires_at < now() then
    return jsonb_build_object('state', 'expired');
  end if;

  select * into c from cards where id = r.card_id;

  select jsonb_agg(jsonb_build_object('path', a.file_url, 'filename', a.filename, 'type', a.file_type)
                   order by array_position(r.attachment_ids, a.id))
    into v_files
    from attachments a
   where a.id = any(r.attachment_ids);

  if r.include_specs then
    v_specs := (
      select jsonb_agg(jsonb_build_object('label', label, 'value', value))
      from (
        values
          ('Coleção',          nullif(btrim(coalesce(c.collection, '')), '')),
          ('Quantidade',       case when c.quantity is not null then c.quantity::text || ' peças' end),
          ('Material externo', nullif(btrim(coalesce(c.outside_material, '')), '')),
          ('Material interno', nullif(btrim(coalesce(c.inside_material, '')), '')),
          ('Logo (externo)',   nullif(btrim(concat_ws(' · ', nullif(c.logo_technique_outside,''),
                                                             nullif(c.logo_text_outside,''),
                                                             nullif(c.logo_color_outside,''))), '')),
          ('Logo (interno)',   nullif(btrim(concat_ws(' · ', nullif(c.logo_technique_inside,''),
                                                             nullif(c.logo_text_inside,''),
                                                             nullif(c.logo_color_inside,''))), ''))
      ) as s(label, value)
      where value is not null
    );
  end if;

  -- Já assinado: a página mostra o comprovante, não o formulário.
  select * into v_sig from approval_signatures where request_id = r.id order by signed_at desc limit 1;

  return jsonb_build_object(
    'state',      case when v_sig.id is not null then 'signed' else 'open' end,
    'reference',  c.ref_number,
    'title',      c.title,
    'client',     c.client_name,
    'files',      coalesce(v_files, '[]'::jsonb),
    'specs',      v_specs,
    'notes',      case when r.include_specs then nullif(btrim(coalesce(c.description, '')), '') end,
    'expires_at', r.expires_at,
    'sent_by',    (select u.full_name from users u where u.id = r.created_by),
    'signature',  case when v_sig.id is null then null else jsonb_build_object(
                    'decision', v_sig.decision, 'name', v_sig.signer_name, 'email', v_sig.signer_email,
                    'at', v_sig.signed_at, 'note', v_sig.note, 'accepted_terms', v_sig.accepted_terms) end
  );
end;
$$;

grant execute on function approval_view(text) to anon, authenticated;

-- ── assinar ─────────────────────────────────────────────────────────────────

create or replace function approval_sign(
  p_token text,
  p_name text,
  p_email text,
  p_decision text,
  p_accepted_terms boolean,
  p_snapshot jsonb,
  p_note text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r approval_requests;
  c cards;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
  v_at timestamptz := now();
begin
  select * into r from approval_requests
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  if r.id is null then raise exception 'This link is not valid'; end if;
  if r.revoked_at is not null then raise exception 'This link was cancelled'; end if;
  if r.expires_at < now() then raise exception 'This link has expired'; end if;
  if r.signed_at is not null then raise exception 'This link was already signed'; end if;

  if length(v_name) < 3 then raise exception 'Informe seu nome completo'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido';
  end if;
  if p_decision not in ('approved', 'changes') then raise exception 'Invalid decision'; end if;
  -- Aprovar sem aceitar o termo não é meia aprovação: é nenhuma.
  if p_decision = 'approved' and not coalesce(p_accepted_terms, false) then
    raise exception 'É preciso aceitar o Termo de Aprovação';
  end if;
  if p_decision = 'changes' and length(btrim(coalesce(p_note, ''))) < 6 then
    raise exception 'Diga o que precisa mudar';
  end if;

  select * into c from cards where id = r.card_id;

  insert into approval_signatures (request_id, decision, signer_name, signer_email, accepted_terms,
                                   note, signed_at, ip, user_agent, snapshot, snapshot_hash)
  values (r.id, p_decision, v_name, v_email, coalesce(p_accepted_terms, false),
          nullif(btrim(coalesce(p_note, '')), ''), v_at,
          nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''),
          nullif(btrim(coalesce(p_user_agent, '')), ''),
          coalesce(p_snapshot, '{}'::jsonb),
          encode(extensions.digest(coalesce(p_snapshot, '{}'::jsonb)::text, 'sha256'), 'hex'))
  returning id into v_id;

  update approval_requests set signed_at = v_at where id = r.id;

  if p_decision = 'approved' then
    update cards set client_approved_at = v_at, client_approved_by = v_name where id = r.card_id;
    -- A arte assinada é a arte aprovada: o mesmo selo que a Redantex daria.
    update attachments
       set approved_at = v_at, approval_note = 'Aprovada pelo cliente: ' || v_name
     where id = r.attachment_ids[1] and approved_at is null;
  end if;

  insert into activity_logs (card_id, user_id, action, old_value, new_value)
  values (r.card_id, r.created_by,
          case when p_decision = 'approved' then 'client_approved' else 'client_changes' end,
          v_name, coalesce(nullif(btrim(coalesce(p_note, '')), ''), v_email));

  -- Só a Redantex é avisada: o fornecedor não participa desta conversa.
  begin
    insert into notifications (user_id, card_id, actor_id, type, message)
    select u.id, r.card_id, null,
           case when p_decision = 'approved' then 'client_approved' else 'client_changes' end,
           case when p_decision = 'approved'
                then v_name || ' aprovou a arte de "' || coalesce(c.title, 'uma peça') || '"'
                else v_name || ' pediu ajuste na arte de "' || coalesce(c.title, 'uma peça') || '"'
           end
      from users u
     where u.role in ('admin', 'member')
       and (u.id = r.created_by or u.id = c.salesperson_id or u.id = c.project_manager_id or u.id = c.created_by);
  exception when others then
    raise warning 'approval_sign notification failed: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'signature_id', v_id, 'at', v_at);
end;
$$;

grant execute on function approval_sign(text, text, text, text, boolean, jsonb, text, text) to anon, authenticated;

-- ── cancelar ────────────────────────────────────────────────────────────────

create or replace function approval_revoke(p_request uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can cancel an approval link';
  end if;
  update approval_requests set revoked_at = now() where id = p_request and signed_at is null;
end;
$$;

revoke all on function approval_revoke(uuid) from public, anon;
grant execute on function approval_revoke(uuid) to authenticated;
