-- As rotinas dizem quando rodaram.
--
-- A pergunta "o email saiu hoje?" só tinha resposta indireta: olhar se havia
-- retrato novo, ou se alguma linha da fila tinha saído. Isso confunde duas
-- coisas muito diferentes — **a rotina não rodou** e **a rotina rodou e não
-- tinha nada a fazer**. A segunda é o caso normal: quase todo dia não há
-- lembrete vencido para enfileirar, e quase toda rodada de quinze minutos
-- encontra a fila vazia.
--
-- Sem distinguir as duas, um agendamento que para de rodar passa semanas
-- invisível, porque o silêncio se parece com o silêncio esperado. É o medo que
-- já estava escrito no comentário da `daily-summary` desde o começo.
--
-- Uma linha por rotina, reescrita a cada execução. Não é log: a pergunta é
-- "quando foi a última vez", e um histórico aqui só cresceria sem ser lido.

create table if not exists job_runs (
  job          text primary key,
  last_run_at  timestamptz not null default now(),
  last_ok      boolean not null default true,
  note         text
);

comment on table job_runs is
  'Quando cada rotina agendada rodou pela última vez, e o que ela fez. '
  'Distingue "não rodou" de "rodou e não tinha nada a fazer".';

insert into job_runs (job, note)
values ('daily-summary',      'ainda não registrou'),
       ('queue-reminders',    'ainda não registrou'),
       ('send-queued-emails', 'ainda não registrou')
on conflict (job) do nothing;

-- As linhas nascem com a data de hoje e a nota dizendo que ainda não
-- registraram: a tabela não sabe das execuções anteriores a ela, e fingir que
-- sabe seria pior. A primeira execução de cada rotina corrige as duas coisas.

alter table job_runs enable row level security;

-- Leitura para a Redantex; quem escreve é a função agendada, com a chave de
-- serviço, que passa por cima de RLS.
create policy "Redantex reads job runs" on job_runs
  for select using (current_user_is_redantex());
