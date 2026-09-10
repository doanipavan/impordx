-- Os códigos de material saem de dentro da descrição.
--
-- `outside_material_code` e `inside_material_code` existiam no TypeScript e nos
-- formulários desde sempre, e não existiam no banco. O texto era enfiado como
-- linhas rotuladas dentro de `description` e desempacotado na leitura, por um
-- par de funções escrito só para isso.
--
-- Isso já quebrou em produção: o Editar card tinha os campos, aceitava o que se
-- digitava e descartava em silêncio no salvar, até 2026-08-24. Trinta e cinco
-- dos quarenta e um cards carregam um código hoje.
--
-- O formato gravado é consistente — zero cards fora do padrão — então a
-- extração é limpa em vez de um garimpo.

alter table cards add column if not exists outside_material_code text;
alter table cards add column if not exists inside_material_code  text;

comment on column cards.outside_material_code is
  'Código do material externo (ex.: 14 - ST206, PANTONE 7529). Morava dentro de description até a 041.';
comment on column cards.inside_material_code is
  'Código do material interno. Morava dentro de description até a 041.';

-- ---------------------------------------------------------------------
-- A descrição original, para que isto seja reversível
-- ---------------------------------------------------------------------
create table if not exists cards_description_backup (
  card_id            uuid primary key,
  description_before text,
  saved_at           timestamptz not null default now()
);

insert into cards_description_backup (card_id, description_before)
  select id, description from cards
  on conflict (card_id) do nothing;

alter table cards_description_backup enable row level security;
-- Sem política: ninguém lê pela API. É registro de manutenção.

-- ---------------------------------------------------------------------
-- A regra, escrita uma vez
-- ---------------------------------------------------------------------
-- Espelha MATERIAL_CODE_LINE do cliente. Linha inteira, rótulo, dois pontos, o
-- resto é o código.

create or replace function material_code_in(p_description text, p_side text)
returns text language sql immutable as $$
  -- btrim com o conjunto inteiro, não trim(): no Postgres, `trim(x)` tira
  -- apenas espaço. O `.trim()` do JavaScript, que esta função diz espelhar,
  -- tira também quebra de linha e tabulação — e texto colado do Windows chega
  -- com \r no fim da linha.
  select nullif(btrim((regexp_match(
    coalesce(p_description, ''),
    '(?ni)^[ \t]*' || p_side || '[ \t]+material[ \t]+code[ \t]*:[ \t]*(.*)$'
  ))[1], E' \t\n\r'), '')
$$;

-- O que sobra da descrição depois de tirar essas linhas. Monta linha a linha em
-- vez de apagar com regexp: assim uma linha que só *contém* o rótulo no meio de
-- uma frase não é mutilada pela metade.
create or replace function description_without_codes(p_description text)
returns text language sql immutable as $$
  select nullif(btrim(coalesce((
    select string_agg(line, E'\n' order by ord)
      from regexp_split_to_table(coalesce(p_description, ''), E'\n')
           with ordinality as t(line, ord)
     where line !~* '^[ \t]*(outside|inside)[ \t]+material[ \t]+code[ \t]*:'
  ), ''), E' \t\n\r'), '')
$$;

-- ---------------------------------------------------------------------
-- Na entrada, para as abas que ficaram abertas
-- ---------------------------------------------------------------------
-- A tela nova grava nas colunas. Mas quem estiver com o hub aberto desde antes
-- do deploy continua gravando o formato velho por algumas horas — e o
-- importador de planilha nunca soube gravar código nenhum. Este gatilho torna
-- os dois caminhos equivalentes em vez de deixar um deles perder dado.

create or replace function cards_lift_material_codes()
returns trigger language plpgsql as $$
declare
  v_out text;
  v_in  text;
begin
  if new.description is null then return new; end if;

  v_out := material_code_in(new.description, 'outside');
  v_in  := material_code_in(new.description, 'inside');

  if v_out is null and v_in is null then return new; end if;

  -- O texto vence, e a ordem importa. Só um cliente antigo (ou o importador)
  -- escreve código dentro da descrição, e quando escreve é porque alguém acabou
  -- de digitar ali. Na ordem inversa, `new.outside_material_code` — que num
  -- update é o valor que já estava na linha — mascararia o que foi digitado, e o
  -- código novo se perderia em silêncio. Que é o bug que esta migração conserta.
  new.outside_material_code := coalesce(v_out, new.outside_material_code);
  new.inside_material_code  := coalesce(v_in,  new.inside_material_code);
  new.description           := description_without_codes(new.description);

  return new;
end
$$;

drop trigger if exists cards_material_codes_tidy on cards;
create trigger cards_material_codes_tidy
  before insert or update of description on cards
  for each row execute function cards_lift_material_codes();

-- ---------------------------------------------------------------------
-- O que já está lá
-- ---------------------------------------------------------------------

update cards
   set outside_material_code = material_code_in(description, 'outside'),
       inside_material_code  = material_code_in(description, 'inside'),
       description           = description_without_codes(description)
 where description ~* '(^|\n)[ \t]*(outside|inside)[ \t]+material[ \t]+code[ \t]*:';
