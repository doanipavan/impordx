-- O retrato diário passa a guardar a etapa.
--
-- Guardava mês e valor, e por isso só sabia dizer "este valor trocou de mês".
-- No dia 16/10/2026 dois pedidos chegaram ao Brasil — QUEEN e PRIVATE, R$ 129
-- mil juntos — e o panorama do dia seguinte sairia em silêncio: os dois
-- estavam previstos para outubro e chegaram em outubro, então o mês não mudou
-- e o valor não mudou. A chegada da mercadoria, que é a notícia que o diretor
-- comercial mais quer, era invisível para a comparação.
--
-- A coluna nasce nula nos retratos antigos, e isso é de propósito: a
-- comparação só anuncia mudança de etapa quando o retrato anterior tem uma
-- etapa para comparar. Sem isso, o primeiro email depois desta migração
-- anunciaria uma "mudança" em cada um dos trinta e seis pedidos.

alter table arrival_snapshots add column if not exists status text;

comment on column arrival_snapshots.status is
  'A etapa do pedido quando o retrato foi tirado. Nula nos retratos '
  'anteriores a esta coluna, e a comparação trata nulo como "não sei", '
  'nunca como "mudou".';
