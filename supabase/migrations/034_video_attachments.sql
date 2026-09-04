-- Vídeo nos anexos.
--
-- A Redantex instrui fornecedor por vídeo — mostrar um acabamento é mais
-- rápido do que descrevê-lo em inglês para quem lê inglês como segunda língua.
--
-- Até aqui o bucket `attachments` não impunha nada: `file_size_limit` e
-- `allowed_mime_types` estavam ambos nulos, e o único freio era a lista no
-- cliente. Qualquer coisa, de qualquer tamanho, entrava por chamada direta à
-- API. Já que o limite vai mudar, ele passa a existir também no servidor.
--
-- 50 MB é o teto por arquivo. É o limite do plano gratuito da Supabase, e não
-- adianta pedir mais aqui do que o plano concede — um número maior só produziria
-- uma falha confusa no momento do upload.
--
-- O espaço total é a restrição mais séria e não tem como ser imposta aqui: o
-- plano dá 1 GB, e 189 MB já estão ocupados por 436 arquivos. Cabem cerca de
-- dezesseis vídeos de 50 MB antes de acabar. Vídeo é para instrução pontual,
-- não para arquivo morto.

update storage.buckets
   set file_size_limit = 52428800,   -- 50 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'application/pdf',
         -- mp4 e webm tocam em qualquer navegador. quicktime é o que o iPhone
         -- grava: aceito porque é de onde a maioria dos vídeos vai sair, mesmo
         -- que nem todo navegador consiga pré-visualizar — baixar sempre funciona.
         'video/mp4', 'video/webm', 'video/quicktime'
       ]
 where id = 'attachments';
