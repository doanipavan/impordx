-- O tamanho passa a ser escrito de um jeito só.
--
-- `card_items.size` é texto livre, e a mesma caixa aparecia como `5 x 6 x 4,5`,
-- `5 x 6 x 4.5 cm`, `5 x 6 x4.5 cm` e `7,5 × 6,5 × 5,2 cm` — vírgula ou ponto,
-- `x` minúsculo, maiúsculo ou o sinal `×` do Word, `cm` às vezes. Eram 48
-- grafias para 33 tamanhos reais. Qualquer pergunta agrupada por tamanho —
-- preço médio de compra, que foi a que revelou isto — respondia errado, e sem
-- avisar: cada grafia virava um grupo com uma peça só.
--
-- O padrão escolhido é o que a casa já escrevia na maioria: `7,5 x 6,5 x 5,2 cm`.
-- Vírgula, não ponto, porque 83 dos 107 itens já vinham assim — trocar para o
-- ponto mexeria em 100 linhas para ganhar nada.
--
-- Ninguém precisa mudar como digita. O banco arruma na entrada.

-- ---------------------------------------------------------------------
-- O texto original, para que isto seja reversível
-- ---------------------------------------------------------------------
-- Reescrever 107 linhas com uma regex é o tipo de coisa que só se descobre
-- errada depois. Guardar o antes custa uma tabela minúscula e transforma o
-- desfazer num update, em vez de num backup.

create table if not exists card_items_size_backup (
  item_id     uuid primary key,
  size_before text,
  saved_at    timestamptz not null default now()
);

insert into card_items_size_backup (item_id, size_before)
  select id, size from card_items
  on conflict (item_id) do nothing;   -- roda de novo sem apagar o original

alter table card_items_size_backup enable row level security;
-- Sem política nenhuma: ninguém lê pela API. É registro de manutenção, não dado
-- de aplicação.

-- ---------------------------------------------------------------------
-- A regra
-- ---------------------------------------------------------------------

create or replace function normalize_size(p text)
returns text language sql immutable as $$
  with s as (
    select lower(coalesce(p, '')) as t
  ),
  -- Só mexe no que é reconhecidamente uma medida. Se sobrar qualquer letra
  -- depois de tirar os números, os separadores e o `cm`, o texto volta
  -- intocado: um `diâmetro 5` virando `5 cm` perderia a única palavra que
  -- importava. Uma limpeza que apaga o que não entendeu é pior que a sujeira.
  guard as (
    select t, regexp_replace(replace(t, 'cm', ''), '[0-9.,x× ]', '', 'g') = '' as safe
    from s
  ),
  nums as (
    select (select string_agg(replace(m[1], '.', ','), ' x ' order by ord)
              from regexp_matches(
                     replace(replace(replace(t, '×', 'x'), ',', '.'), ' ', ''),
                     '[0-9]+(?:\.[0-9]+)?', 'g') with ordinality as t2(m, ord)) as joined,
           safe
      from guard
  ),
  -- Conta as medidas já juntas, não os grupos de dígitos do texto cru: ali a
  -- vírgula decimal parte `7,5` em dois, e `7,5 × 6,5 × 5,2` "teria seis
  -- medidas". Três casos passavam só porque a conta errada caía no intervalo.
  counted as (
    select joined, safe, coalesce(array_length(string_to_array(joined, ' x '), 1), 0) as howmany
      from nums
  )
  select case
    -- Duas medidas também valem: quatro itens são sacos, sem altura. Forçar
    -- três inventaria uma dimensão que ninguém mediu.
    when p is null or not safe or howmany not between 2 and 3 or joined is null then p
    else joined || ' cm'
  end
  from counted
$$;

comment on function normalize_size(text) is
  'Uma caixa, uma grafia: 7,5 x 6,5 x 5,2 cm. Devolve o texto original intacto '
  'quando não reconhece uma medida.';

-- ---------------------------------------------------------------------
-- Na entrada, sozinho
-- ---------------------------------------------------------------------
-- No banco e não na tela porque os itens entram por três caminhos — o formulário,
-- a importação de planilha e a promoção de card — e uma regra que mora num deles
-- só limpa um terço.

create or replace function card_items_tidy_size()
returns trigger language plpgsql as $$
begin
  new.size := normalize_size(new.size);
  return new;
end
$$;

drop trigger if exists card_items_size_tidy on card_items;
create trigger card_items_size_tidy
  before insert or update of size on card_items
  for each row execute function card_items_tidy_size();

-- ---------------------------------------------------------------------
-- O que já está lá
-- ---------------------------------------------------------------------

update card_items
   set size = normalize_size(size)
 where size is not null
   and size is distinct from normalize_size(size);
