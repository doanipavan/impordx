-- Planilha passa a ser anexo.
--
-- O bucket aceitava imagem, PDF e três formatos de vídeo. Excel não estava na
-- lista, então a tela nem oferecia o arquivo e o servidor recusaria de qualquer
-- forma — e é assim que preço, lista de itens e o controle que a DEQI manda
-- circulam hoje.
--
-- Planilha com macro fica de fora, por decisão: é programa que roda ao abrir.
-- Os formatos com macro (.xlsm, .xlsb, .xltm, .xlam) têm tipos MIME próprios,
-- que não entram aqui — e o cliente ainda recusa pela extensão, porque o tipo
-- declarado pelo navegador vem do sistema operacional e nem sempre distingue.
--
-- `application/vnd.ms-excel` é o .xls, e também o que o Windows com Excel
-- instalado reporta para um .csv. Os dois casos caem no mesmo tipo.
--
-- A lista equivalente no cliente está em src/lib/fileTypes.ts. Mexeu numa,
-- mexa na outra: liberar só de um lado produz uma recusa que ninguém explica.

update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'application/pdf',
         'video/mp4', 'video/webm', 'video/quicktime',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
         'application/vnd.ms-excel',                                           -- .xls
         'text/csv'                                                            -- .csv
       ]
 where id = 'attachments';
