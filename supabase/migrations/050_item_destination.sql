-- Um produto do pedido vai para o estoque da Redantex ou para um cliente.
--
-- Fica no item e não no card porque um pedido mistura: o ORD-2026-10045 tem
-- quatro produtos diferentes numa coisa só. O card soma e mostra o resultado.
--
-- Nulo é um estado legítimo: quer dizer "ninguém escolheu ainda". Cotações e
-- amostras nascem assim de propósito — quem escolhe é quem adiciona o produto,
-- e a tela já chega com Client marcado.

alter table card_items add column if not exists destination text;

alter table card_items drop constraint if exists card_items_destination_check;
alter table card_items add constraint card_items_destination_check
  check (destination is null or destination in ('stock', 'client'));

-- O que já está em pedido é de cliente. Doani escolheu o alcance: só os
-- pedidos, não as cotações nem as amostras. Depois ele vira à mão os poucos
-- que forem de estoque.
update card_items i
   set destination = 'client'
  from cards c
 where c.id = i.card_id
   and c.board = 'orders'
   and i.destination is null;

comment on column card_items.destination is
  'stock = linha própria da Redantex, client = pedido de cliente. Nulo = ainda não escolhido.';
