-- O cliente é avisado quando a data escorrega mais de cinco dias.
--
-- Cinco dias é escolha do Doani, e é um limiar de aviso — não uma regra de
-- prazo. As réguas de entrega continuam fora do banco, onde sempre
-- estiveram: os 60 dias da amostra e os 50 da logística não aparecem aqui,
-- nem devem. Guardar prazo em SQL é o erro que o CLAUDE.md descreve, e que
-- já fez duas telas responderem com a regra morta.
--
-- Abaixo de cinco dias o vendedor absorve e não se escreve ao cliente por
-- causa de um ajuste de três dias na fábrica.

create or replace function enqueue_client_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  destino text;
  nome    text;
  dias    int;
begin
  if new.board <> 'orders' then return new; end if;
  if new.archived then return new; end if;
  if new.delivery_date is null or old.delivery_date is null then return new; end if;
  if new.delivery_date = old.delivery_date then return new; end if;

  -- Para mais ou para menos: antecipar também é notícia, e o cliente pode
  -- precisar se preparar para receber antes.
  dias := abs(new.delivery_date - old.delivery_date);
  if dias <= 5 then return new; end if;

  -- O pedido precisa estar vivo e já conhecido do cliente. Antes de Placed
  -- ele nunca ouviu falar em data nenhuma, e receberia a correção de uma
  -- promessa que não lhe foi feita.
  if new.status not in ('Placed', 'In Production', 'Ready to Ship',
                        'Collected', 'Shipped') then
    return new;
  end if;

  select btrim(c.email), c.name into destino, nome
    from clients c where c.id = new.client_id;
  if destino is null or destino = '' then return new; end if;

  -- Se já existe um aviso de data esperando na fila, ele ainda não saiu e vai
  -- sair com a data mais recente — a função relê o card na hora de enviar.
  -- Duas remarcações na mesma tarde viram um email, não dois.
  if exists (
    select 1 from email_outbox
     where card_id = new.id and kind = 'date-change' and status = 'pending'
  ) then
    return new;
  end if;

  insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind)
  values (new.id, new.client_id, new.ref_number, nome, destino, 'date-change');

  return new;
exception when others then
  raise warning 'enqueue_client_date_change falhou no card %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_client_date_change on cards;
create trigger trg_enqueue_client_date_change
  after update on cards
  for each row execute function enqueue_client_date_change();

comment on function enqueue_client_date_change is
  'Avisa o cliente quando a data de pronto anda mais de cinco dias, para '
  'frente ou para trás. Compara mudanças consecutivas: três dias hoje e '
  'três amanhã não somam seis para este efeito.';
