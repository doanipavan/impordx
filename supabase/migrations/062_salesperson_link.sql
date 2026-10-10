-- O link do vendedor: a carteira dele no celular, sem conta e sem senha.
--
-- São vinte e cinco vendedores para cinco contas no hub, e dar login a todos
-- esbarra em duas coisas: a conta nova nasce como `member`, que pela política
-- aberta de edição pode alterar qualquer pedido, e senha para vinte e cinco
-- pessoas é senha para administrar. O caminho escolhido é o que o cliente já
-- usa para assinar a arte: um endereço com token, que abre no telefone e
-- mostra só o que é daquela pessoa.
--
-- Mesma mecânica da 030: o banco guarda o **hash** do token, nunca o token.
-- Um dump do banco não entrega link funcionando, e quem tem acesso de leitura
-- aqui dentro também não consegue abrir a carteira de ninguém.
--
-- Um link ativo por vendedor. Criar de novo revoga o anterior — é o que
-- "rotacionar" quer dizer quando alguém encaminha o link para o lugar errado.

create table if not exists salesperson_links (
  id              uuid primary key default gen_random_uuid(),
  salesperson_id  uuid not null references salespeople(id) on delete cascade,
  token_hash      text not null unique,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id),
  revoked_at      timestamptz,
  -- Quem nunca abriu é informação: o link foi mandado e ninguém usou.
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      integer not null default 0
);

comment on table salesperson_links is
  'Endereço pessoal de cada vendedor para ver a carteira dele sem conta. '
  'Guarda o hash do token, nunca o token. Um ativo por vendedor.';

create index if not exists salesperson_links_owner
  on salesperson_links (salesperson_id) where revoked_at is null;

alter table salesperson_links enable row level security;

-- A Redantex vê quando foi criado e quantas vezes foi aberto. Criar, revogar
-- e abrir passam pelas funções abaixo, que são `security definer`: não há
-- política de escrita nenhuma, então nem a Redantex forja um link pela API.
drop policy if exists "Redantex reads links" on salesperson_links;
create policy "Redantex reads links" on salesperson_links
  for select using (current_user_is_redantex());

-- ---------------------------------------------------------------------------
-- Criar
-- ---------------------------------------------------------------------------

create or replace function sales_link_create(p_salesperson uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can create a salesperson link';
  end if;
  if not exists (select 1 from salespeople where id = p_salesperson) then
    raise exception 'No such salesperson';
  end if;

  -- O anterior morre aqui. Dois links vivos para a mesma pessoa significam
  -- que revogar um não fecha a porta, e ninguém saberia disso até precisar.
  update salesperson_links
     set revoked_at = now()
   where salesperson_id = p_salesperson and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into salesperson_links (salesperson_id, token_hash, created_by)
  values (p_salesperson, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());

  -- Devolvido uma única vez. O banco guarda o hash, então não há como
  -- mostrá-lo de novo depois — e é isso que o torna um segredo de verdade.
  return v_token;
end;
$$;

create or replace function sales_link_revoke(p_salesperson uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not current_user_is_redantex() then
    raise exception 'Only Redantex can revoke a salesperson link';
  end if;
  update salesperson_links
     set revoked_at = now()
   where salesperson_id = p_salesperson and revoked_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abrir
-- ---------------------------------------------------------------------------

/*
 * O que a página mostra, e só isso.
 *
 * Quem chama é um navegador sem conta, então cada coluna aqui é uma decisão.
 * Ficam de fora, porque um link pode ser encaminhado: o texto em que a fábrica
 * explica um atraso, o número da proforma, qualquer preço em dólar e o
 * endereço do cliente — este último vira apenas um sim/não, que é o que o
 * vendedor precisa saber ("falta cadastrar o email dele") sem que o endereço
 * viaje no link.
 *
 * O nome curto do fornecedor viaja, e **não é mostrado em lugar nenhum da
 * página**. Está aqui porque cada fornecedor tem uma âncora de prazo
 * diferente, e sem ela a previsão de chegada desta página divergiria da do
 * hub e da que o cliente recebeu por email. Entre esconder um nome que o
 * vendedor já conhece e mostrar um mês errado para quem fala com o cliente, a
 * escolha é fácil.
 *
 * As datas vão cruas: a previsão de chegada é calculada na página pela mesma
 * régua do hub e do email do cliente.
 */
create or replace function sales_link_view(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link salesperson_links%rowtype;
  v_nome text;
  v_pedidos json;
begin
  select * into v_link
    from salesperson_links
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and revoked_at is null;

  if v_link.id is null then
    return null;
  end if;

  select name into v_nome from salespeople where id = v_link.salesperson_id;

  update salesperson_links
     set open_count = open_count + 1,
         last_opened_at = now(),
         first_opened_at = coalesce(first_opened_at, now())
   where id = v_link.id;

  select coalesce(json_agg(p order by p.chegada_base nulls last), '[]'::json) into v_pedidos
    from (
      select c.ref_number,
             coalesce(cl.name, c.client_name) as cliente,
             c.status,
             c.status_since,
             c.value_brl,
             c.purchase_order,
             c.sample_approved_at,
             c.order_confirmed_at,
             c.delivery_date,
             c.delivery_date_promised,
             c.delivery_date_changed_at,
             c.arrived_at,
             -- Só para o cálculo do prazo. A página não o desenha.
             sup.short_name as fornecedor,
             -- Sim ou não, nunca o endereço.
             (btrim(coalesce(cl.email, '')) <> '') as cliente_tem_email,
             coalesce((
               select json_agg(json_build_object('size', i.size, 'quantity', i.quantity)
                               order by i.sort_order)
                 from card_items i where i.card_id = c.id), '[]'::json) as itens,
             coalesce(c.arrived_at, c.delivery_date, c.sample_approved_at) as chegada_base
        from cards c
        left join clients cl on cl.id = c.client_id
        left join suppliers sup on sup.id = c.supplier_id
       where c.salesperson_ref_id = v_link.salesperson_id
         and c.board = 'orders'
         and not c.archived
         and c.status <> 'Lost'
    ) p;

  return json_build_object('vendedor', v_nome, 'pedidos', v_pedidos);
end;
$$;

-- Quem abre o link não tem conta. `anon` executa a função de leitura, e só
-- ela: criar e revogar continuam exigindo ser Redantex, verificado dentro da
-- própria função.
revoke all on function sales_link_view(text) from public;
grant execute on function sales_link_view(text) to anon, authenticated, service_role;
revoke all on function sales_link_create(uuid) from public, anon;
grant execute on function sales_link_create(uuid) to authenticated, service_role;
revoke all on function sales_link_revoke(uuid) from public, anon;
grant execute on function sales_link_revoke(uuid) to authenticated, service_role;
