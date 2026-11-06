-- Todo cliente novo passa a existir, em vez de ficar só como texto no card.
--
-- A 051 criou a tabela de clientes e a semeou com os 49 nomes que havia
-- naquele dia. Ninguém cuidou do dia seguinte: nenhum caminho de escrita cria
-- a linha do cliente quando um card chega com um nome novo. O resultado é um
-- card com `client_name` preenchido e `client_id` nulo — e, sem vínculo, não
-- há onde guardar o email, o bloco do card aparece sem botão nenhum, e aquele
-- cliente nunca receberá aviso algum.
--
-- Descoberto em 6/11/2026 na DAMA JOIAS, e já eram sete cards: DAMA JOIAS e
-- CACI nos pedidos, mais quatro cotações. O defeito não dava sinal — crescia
-- um cliente por vez, cada um silenciosamente impossível de avisar.
--
-- O conserto mora no banco, e não na tela, porque há vários caminhos de
-- escrita: o modal de criar, o de editar, o importador de planilha e a
-- promoção de cotação a pedido. Todos passam por aqui.

create or replace function link_card_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nome text := btrim(coalesce(new.client_name, ''));
  achado uuid;
begin
  if nome = '' then
    return new;
  end if;

  -- Já vinculado ao cliente certo: nada a fazer. A comparação ignora caixa e
  -- espaço, como o índice único da tabela.
  if new.client_id is not null and exists (
    select 1 from clients c
     where c.id = new.client_id and upper(btrim(c.name)) = upper(nome)
  ) then
    return new;
  end if;

  select id into achado from clients where upper(btrim(name)) = upper(nome) limit 1;

  if achado is null then
    insert into clients (name) values (nome)
    on conflict do nothing;
    -- Reconsulta em vez de usar `returning`: duas transações criando o mesmo
    -- cliente ao mesmo tempo fazem o `on conflict` não devolver linha, e aí a
    -- segunda precisa encontrar a que a primeira gravou.
    select id into achado from clients where upper(btrim(name)) = upper(nome) limit 1;
  end if;

  new.client_id := achado;
  return new;
exception when others then
  -- A mesma disciplina dos outros gatilhos: vincular cliente não pode ser o
  -- motivo de um card não salvar.
  raise warning 'link_card_client falhou no card %: %', new.id, sqlerrm;
  return new;
end;
$$;

comment on function link_card_client is
  'Garante que todo card com nome de cliente aponte para uma linha de '
  'clients, criando-a se for a primeira vez. Sem isto, cliente novo nasce '
  'impossível de avisar.';

drop trigger if exists trg_link_card_client on cards;
create trigger trg_link_card_client
  before insert or update of client_name, client_id on cards
  for each row execute function link_card_client();

-- ---------------------------------------------------------------------------
-- Os sete que já estavam órfãos
-- ---------------------------------------------------------------------------

insert into clients (name)
select distinct on (upper(btrim(c.client_name))) btrim(c.client_name)
  from cards c
 where btrim(coalesce(c.client_name, '')) <> ''
   and c.client_id is null
   and not exists (
     select 1 from clients cl where upper(btrim(cl.name)) = upper(btrim(c.client_name)))
 order by upper(btrim(c.client_name)), c.created_at desc
on conflict do nothing;

update cards c
   set client_id = cl.id
  from clients cl
 where c.client_id is null
   and btrim(coalesce(c.client_name, '')) <> ''
   and upper(btrim(cl.name)) = upper(btrim(c.client_name));
