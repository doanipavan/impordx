-- 049 · Quem assina o pedido de aprovação é o vendedor da peça
--
-- 29 set 2026. A tela dizia "Doani Pavan, da Redantex, enviou esta arte" em
-- todo link, porque era ele quem clicava no botão. O cliente não conhece quem
-- clicou: conhece o vendedor que cuida da conta dele, e é esse nome que
-- precisa aparecer.
--
-- Fonte tirada da função no ar, com uma linha trocada.

CREATE OR REPLACE FUNCTION public.approval_view(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Quem o cliente conhece é o vendedor da peça, não quem apertou o botão
    -- de gerar o link. A conta ligada vem primeiro; sem ela, o nome digitado
    -- no card; sem nenhum dos dois, quem enviou.
    'sent_by',    coalesce(
                    (select u.full_name from users u where u.id = c.salesperson_id),
                    nullif(btrim(coalesce(c.salesperson_name, '')), ''),
                    (select u.full_name from users u where u.id = r.created_by)
                  ),
    'signature',  case when v_sig.id is null then null else jsonb_build_object(
                    'decision', v_sig.decision, 'name', v_sig.signer_name, 'email', v_sig.signer_email,
                    'at', v_sig.signed_at, 'note', v_sig.note, 'accepted_terms', v_sig.accepted_terms) end
  );
end;
$function$;
