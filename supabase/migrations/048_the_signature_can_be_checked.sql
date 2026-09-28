-- 048 · A assinatura vira prova
--
-- 28 set 2026. A assinatura já guardava nome, e-mail, IP, hora e o hash do que
-- estava na tela. Isso é, na lei brasileira, uma **assinatura eletrônica
-- simples** (MP 2.200-2/2001, art. 10 §2º; Lei 14.063/2020): vale entre as
-- partes que a aceitam. Duas coisas faltavam: o Termo não dizia que as partes
-- aceitam o meio eletrônico (agora diz, na seção 6 de approvalTerms.ts, ainda
-- por revisar com o jurídico), e nada no papel permitia a um terceiro conferir
-- que aquele comprovante corresponde a um registro real.
--
-- Esta migração fecha isso:
--   · documento do signatário (CPF/CNPJ), declarado por ele;
--   · código de conferência impresso no comprovante;
--   · página pública /verificar que confirma o registro sem expor o card;
--   · quando o link foi aberto pela primeira vez, e quantas vezes — a trilha
--     que sustenta "ele recebeu, abriu e assinou".
--
-- O que isto NÃO é: assinatura qualificada ICP-Brasil, que exige certificado
-- do signatário. Se um dia for preciso, o caminho é um provedor (gov.br,
-- Clicksign, D4Sign) — e o registro daqui continua valendo do mesmo jeito.

alter table approval_signatures add column if not exists signer_document text;
alter table approval_signatures add column if not exists verify_code text;
create unique index if not exists approval_signatures_verify_code on approval_signatures(verify_code);

-- Quando o cliente abriu o link, e quantas vezes. Prova de recebimento.
alter table approval_requests add column if not exists first_opened_at timestamptz;
alter table approval_requests add column if not exists open_count int not null default 0;

-- Toda abertura do link é registrada. A função de leitura já roda como dono,
-- então o contador sobe sem abrir a tabela para ninguém.
create or replace function approval_touch(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update approval_requests
     set first_opened_at = coalesce(first_opened_at, now()),
         open_count = open_count + 1
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and signed_at is null and revoked_at is null and expires_at > now();
end;
$$;

grant execute on function approval_touch(text) to anon, authenticated;

-- A conferência pública. Devolve o suficiente para confirmar o documento e
-- nada além: sem card, sem arquivos, sem e-mail inteiro, sem preço.
create or replace function approval_verify(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s approval_signatures;
  rq approval_requests;
  c cards;
begin
  select * into s from approval_signatures
   where verify_code = upper(btrim(coalesce(p_code, '')));
  if s.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into rq from approval_requests where id = s.request_id;
  select * into c from cards where id = rq.card_id;

  return jsonb_build_object(
    'found', true,
    'decision', s.decision,
    'reference', c.ref_number,
    'signer_name', s.signer_name,
    -- E-mail mascarado: confirma sem publicar o contato de ninguém.
    'signer_email', regexp_replace(s.signer_email, '^(.).*(@.*)$', '\1***\2'),
    'signer_document', case when s.signer_document is null then null
                            else regexp_replace(s.signer_document, '^(...).*(..)$', '\1*****\2') end,
    'signed_at', s.signed_at,
    'accepted_terms', s.accepted_terms,
    'snapshot_hash', s.snapshot_hash,
    'ip', s.ip,
    'sent_at', rq.created_at,
    'first_opened_at', rq.first_opened_at,
    'open_count', rq.open_count
  );
end;
$$;

grant execute on function approval_verify(text) to anon, authenticated;

-- A versão de 8 argumentos sai de cena. Um parâmetro com DEFAULT cria uma
-- sobrecarga em vez de substituir a função: as duas ficariam no ar e a antiga
-- gravaria assinatura sem código de conferência.
drop function if exists approval_sign(text, text, text, text, boolean, jsonb, text, text);

-- A função de assinar, tirada do ar, com o documento e o código acrescentados.
--
-- O regex do e-mail usa [.] e não \. de propósito: pg_get_functiondef devolve
-- a barra escapada, e cada ida e volta por um arquivo a multiplica — foi assim
-- que esta função passou alguns minutos recusando todo e-mail válido.
CREATE OR REPLACE FUNCTION public.approval_sign(p_token text, p_name text, p_email text, p_decision text, p_accepted_terms boolean, p_snapshot jsonb, p_note text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_document text DEFAULT NULL::text)
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
  v_doc text := nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), '');
  v_code text;
begin
  select * into r from approval_requests
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  if r.id is null then raise exception 'This link is not valid'; end if;
  if r.revoked_at is not null then raise exception 'This link was cancelled'; end if;
  if r.expires_at < now() then raise exception 'This link has expired'; end if;
  if r.signed_at is not null then raise exception 'This link was already signed'; end if;

  if length(v_name) < 3 then raise exception 'Informe seu nome completo'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
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

  -- CPF ou CNPJ, quando informado: só o formato. Validar o dígito aqui daria
  -- uma falsa sensação de identidade — o documento vale como declaração de
  -- quem assinou, que é o que a lei chama de assinatura eletrônica simples.
  if v_doc is not null and length(v_doc) not in (11, 14) then
    raise exception 'CPF ou CNPJ inválido';
  end if;

  select * into c from cards where id = r.card_id;

  -- Código curto de conferência: é o que vai impresso no comprovante e o que
  -- qualquer pessoa digita em /verificar para confirmar que aquele papel
  -- corresponde a uma assinatura registrada aqui.
  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));

  insert into approval_signatures (request_id, decision, signer_name, signer_email, accepted_terms,
                                   note, signed_at, ip, user_agent, snapshot, snapshot_hash,
                                   signer_document, verify_code)
  values (r.id, p_decision, v_name, v_email, coalesce(p_accepted_terms, false),
          nullif(btrim(coalesce(p_note, '')), ''), v_at,
          nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''),
          nullif(btrim(coalesce(p_user_agent, '')), ''),
          coalesce(p_snapshot, '{}'::jsonb),
          encode(extensions.digest(coalesce(p_snapshot, '{}'::jsonb)::text, 'sha256'), 'hex'),
          v_doc, v_code)
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

  return jsonb_build_object('ok', true, 'signature_id', v_id, 'at', v_at, 'verify_code', v_code);
end;
$function$;

grant execute on function approval_sign(text, text, text, text, boolean, jsonb, text, text, text) to anon, authenticated;
