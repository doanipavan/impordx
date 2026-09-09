-- Desfazer o fecho de um pedido.
--
-- Fechar cria duas linhas e nada mais, então desfazer é apagá-las. Mas a regra
-- de quando isso é permitido fica aqui e não na tela: apagar uma parcela já
-- paga destruiria o registro de dinheiro que saiu de verdade, e uma proteção
-- que mora só no botão desaparece na primeira chamada direta à API.

create or replace function reopen_card_payment(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pago int;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can reopen an order';
  end if;

  select count(*) into v_pago
    from card_payments where card_id = p_card_id and paid_at is not null;

  if v_pago > 0 then
    raise exception 'This order has a payment already recorded — clear the payment first';
  end if;

  delete from card_payments where card_id = p_card_id;
end;
$$;

revoke execute on function reopen_card_payment(uuid) from public, anon;
grant execute on function reopen_card_payment(uuid) to authenticated;
