-- 047 · O aviso diz o que o cliente pediu
--
-- 28 set 2026, uma hora depois de 046 entrar no ar. O cliente pediu "alteração
-- da cor externa, não corresponde ao pantone enviado" — e o sino avisou apenas
-- que ele "pediu ajuste". O motivo estava gravado na assinatura e no histórico,
-- nos dois lugares onde ninguém foi olhar. Um aviso que não diz o que fazer
-- obriga a abrir o card para descobrir, e foi o que aconteceu.
--
-- Fonte tirada da função no ar, com uma linha trocada.

CREATE OR REPLACE FUNCTION public.approval_sign(p_token text, p_name text, p_email text, p_decision text, p_accepted_terms boolean, p_snapshot jsonb, p_note text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' then
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
                else v_name || ' pediu ajuste na arte de "' || coalesce(c.title, 'uma peça') || '": '
                     || coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'sem motivo informado')
           end
      from users u
     where u.role in ('admin', 'member')
       and (u.id = r.created_by or u.id = c.salesperson_id or u.id = c.project_manager_id or u.id = c.created_by);
  exception when others then
    raise warning 'approval_sign notification failed: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'signature_id', v_id, 'at', v_at);
end;
$function$;
