-- O nome do vendedor continua no card, e passa a ser mantido pelo cadastro.
--
-- A 051 fez isto com o cliente e explicou por quê: `cards` é lida por
-- qualquer conta autenticada, a DEQI inclusive, enquanto `salespeople` é só
-- da Redantex. Se o quadro fosse buscar o nome do outro lado da política, a
-- consulta do fornecedor passaria a embutir uma tabela que ele não pode ler —
-- e o quadro dele é a última coisa que se quer descobrir quebrada.
--
-- Então o nome fica onde sempre esteve, em `salesperson_name`, e o cadastro
-- manda nele: renomear o vendedor reescreve os cards dele. É cópia, e cópia
-- tem que ter um dono — este é o gatilho que faz o cadastro ser o dono.

-- Alinha o que já existe: os cards da Júlia param de dizer `JULIA` e `Julia`.
update cards c
   set salesperson_name = s.name
  from salespeople s
 where c.salesperson_ref_id = s.id
   and coalesce(c.salesperson_name, '') <> s.name;

create or replace function sync_salesperson_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update cards set salesperson_name = new.name where salesperson_ref_id = new.id;
  end if;
  return new;
end;
$$;

comment on function sync_salesperson_name is
  'Mantém cards.salesperson_name igual ao nome do cadastro. Sem isto, '
  'corrigir uma grafia deixaria a grafia velha em todos os cards antigos.';

drop trigger if exists trg_sync_salesperson_name on salespeople;
create trigger trg_sync_salesperson_name
  after update of name on salespeople
  for each row execute function sync_salesperson_name();
