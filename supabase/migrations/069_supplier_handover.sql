-- Trocar o fornecedor de um pedido sem entregar o trabalho do anterior.
--
-- Um card é visível para o fornecedor dele, e comentário, arquivo e item
-- seguem o card. Então mudar `supplier_id` passava a conversa inteira, a arte
-- e os preços de um fornecedor para o outro — e a regra mais dura deste
-- sistema é que um fornecedor nunca vê o que é do outro.
--
-- Aconteceu duas vezes, em setembro de 2026, de DEQI para Sconcept. Nenhuma
-- vazou nada: aqueles cards só tinham material da Redantex e do próprio
-- Carlos, que é o lado da Sconcept. Foi a ordem dos acontecimentos, não o
-- sistema.
--
-- A regra nova: o que um fornecedor escreveu ou enviou só é visível para ele
-- e para a Redantex. Em card que nunca trocou de mãos isso não muda nada —
-- todo o material já é da Redantex ou do único fornecedor envolvido. O efeito
-- aparece exatamente no caso que precisava ser coberto.

create or replace function can_see_authored(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_user_is_redantex()
      -- Sem autor é coisa do sistema, e sistema não tem lado.
      or p_author is null
      or (select u.supplier_id from users u where u.id = p_author) is null
      or (select u.supplier_id from users u where u.id = p_author) = current_user_supplier()
$$;

comment on function can_see_authored is
  'Quem escreveu é de que lado. Usada junto de can_see_card para que a troca '
  'de fornecedor não entregue a conversa e a arte do anterior.';

drop policy if exists "Comments follow their card" on comments;
create policy "Comments follow their card" on comments
  for select using (can_see_card(card_id) and can_see_authored(user_id));

drop policy if exists "Attachments follow their card" on attachments;
create policy "Attachments follow their card" on attachments
  for select using (can_see_card(card_id) and can_see_authored(user_id));

-- `card_items` fica de fora de propósito: um item não tem autor, é da
-- Redantex, e o que nele pertence ao fornecedor anterior é o preço de compra.
-- Esse caso é tratado na troca, com decisão explícita de quem troca, porque
-- apagar número em silêncio é pior que mostrá-lo.
